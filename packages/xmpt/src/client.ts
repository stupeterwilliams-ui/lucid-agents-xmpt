/**
 * XMPT Client — handles outbound message delivery via A2A task primitives.
 *
 * Transport: agentm (agent messaging) — delivers messages to a peer's
 * xmpt-inbox skill using the A2A sendMessage/waitForTask flow.
 */

import { z } from 'zod';
import type {
  XMPTMessage,
  XMPTPeer,
  XMPTDeliveryResult,
  XMPTSendOptions,
  XMPTSendAndWaitOptions,
} from './types-internal.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SKILL_ID = 'xmpt-inbox';
const POLL_INTERVAL_MS = 150;

/** Resolve a XMPTPeer to a base URL string. */
export function resolvePeerUrl(peer: XMPTPeer): string {
  if ('url' in peer) {
    return peer.url;
  }
  if ('card' in peer) {
    const card = peer.card as Record<string, unknown>;
    const url =
      card.url ??
      (Array.isArray(card.supportedInterfaces) &&
        card.supportedInterfaces[0]?.url);
    if (typeof url !== 'string') {
      throw new XMPTError(
        'PEER_NO_URL',
        'Agent card does not contain a url field'
      );
    }
    return url;
  }
  throw new XMPTError('PEER_INVALID', 'Invalid peer: must have url or card');
}

// ─── Zod schema for validating inbound messages at the inbox entrypoint ──────

export const XMPTMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  content: z.object({
    text: z.string().optional(),
    data: z.unknown().optional(),
    mime: z.string().optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});

export type XMPTMessageInput = z.input<typeof XMPTMessageSchema>;

// ─── Error class ─────────────────────────────────────────────────────────────

export class XMPTError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'XMPTError';
  }
}

// ─── Message builder ─────────────────────────────────────────────────────────

let _counter = 0;

/** Generate a simple unique message ID (UUID v4-ish). */
export function generateMessageId(): string {
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/**
 * Build a complete XMPTMessage from a partial input.
 */
export function buildMessage(
  partial: Pick<XMPTMessage, 'content'> & Partial<XMPTMessage>,
  options?: XMPTSendOptions & { selfUrl?: string; peerUrl?: string }
): XMPTMessage {
  return {
    id: partial.id ?? generateMessageId(),
    threadId: partial.threadId ?? options?.threadId,
    from: partial.from ?? options?.selfUrl,
    to: partial.to ?? options?.peerUrl,
    content: partial.content,
    metadata: partial.metadata ?? options?.metadata,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

/**
 * Deliver a message to a remote peer's inbox skill via HTTP POST.
 *
 * We POST directly to /entrypoints/{skillId}/invoke — this aligns with
 * Lucid's task-based A2A model while giving XMPT semantic clarity.
 */
export async function deliverMessage(
  peerUrl: string,
  message: XMPTMessage,
  options?: XMPTSendOptions
): Promise<XMPTDeliveryResult> {
  const skillId = options?.skillId ?? DEFAULT_SKILL_ID;
  const url = `${peerUrl.replace(/\/$/, '')}/entrypoints/${skillId}/invoke`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: message }),
    });
  } catch (err) {
    throw new XMPTError(
      'PEER_NOT_REACHABLE',
      `Cannot reach peer at ${peerUrl}: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new XMPTError(
      'DELIVERY_FAILED',
      `Peer returned ${response.status}: ${body}`,
      { status: response.status, body }
    );
  }

  const result = await response.json().catch(() => ({})) as Record<string, unknown>;

  return {
    taskId: (result.run_id as string) ?? (result.taskId as string) ?? message.id,
    status: (result.status as string) ?? 'completed',
    messageId: message.id,
  };
}

/**
 * Deliver a message and wait for the remote agent to echo back a reply.
 *
 * The remote agent's inbox handler can return a reply. We retrieve it
 * from the invoke response output.
 */
export async function deliverAndWait(
  peerUrl: string,
  message: XMPTMessage,
  options?: XMPTSendAndWaitOptions
): Promise<XMPTMessage | null> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const skillId = options?.skillId ?? DEFAULT_SKILL_ID;
  const url = `${peerUrl.replace(/\/$/, '')}/entrypoints/${skillId}/invoke`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: message }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === 'AbortError') {
      throw new XMPTError(
        'TIMEOUT',
        `sendAndWait timed out after ${timeoutMs}ms`
      );
    }
    throw new XMPTError(
      'PEER_NOT_REACHABLE',
      `Cannot reach peer at ${peerUrl}: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new XMPTError(
      'DELIVERY_FAILED',
      `Peer returned ${response.status}: ${body}`,
      { status: response.status, body }
    );
  }

  const result = await response.json().catch(() => ({})) as Record<string, unknown>;

  // The invoke response may embed the reply in output.reply or output directly
  const output = result.output as Record<string, unknown> | undefined;
  if (!output) return null;

  // If the inbox handler returned a reply, it is wrapped in output.reply
  const replyContent = output.reply ?? output;
  if (!replyContent || typeof replyContent !== 'object') return null;

  const replyObj = replyContent as Record<string, unknown>;

  return {
    id: (replyObj.id as string) ?? generateMessageId(),
    threadId: message.threadId,
    from: peerUrl,
    to: message.from,
    content: (replyObj.content as XMPTMessage['content']) ?? { text: String(replyContent) },
    metadata: replyObj.metadata as Record<string, unknown> | undefined,
    createdAt: (replyObj.createdAt as string) ?? new Date().toISOString(),
  };
}

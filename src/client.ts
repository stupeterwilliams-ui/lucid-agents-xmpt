/**
 * XMPT HTTP client.
 * Handles peer resolution and message delivery over A2A/HTTP task protocol.
 */

import { fetchAgentCard, sendMessage, getTask } from '@lucid-agents/a2a';
import type {
  XMPTPeer,
  XMPTMessageInput,
  XMPTMessage,
  XMPTDeliveryResult,
  XMPTSendOptions,
} from './types.js';
import { XMPTError, XMPT_ERROR } from './types.js';

const DEFAULT_SKILL_ID = 'xmpt-inbox';
const DEFAULT_MAX_WAIT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

/**
 * Resolve a peer to a base URL string.
 */
function resolvePeerUrl(peer: XMPTPeer): string {
  if ('url' in peer) {
    return peer.url;
  }
  const url = peer.card.url;
  if (!url) {
    throw new XMPTError(
      XMPT_ERROR.PEER_NOT_REACHABLE,
      'AgentCard has no url field'
    );
  }
  return url;
}

/**
 * Build a complete XMPTMessage from input (filling defaults).
 */
export function buildMessage(input: XMPTMessageInput): XMPTMessage {
  return {
    id: input.id ?? crypto.randomUUID(),
    threadId: input.threadId,
    from: input.from,
    to: input.to,
    content: input.content,
    metadata: input.metadata,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Send an XMPT message to a remote peer.
 *
 * Resolves the peer URL → fetches agent card → posts a task message to the
 * remote agent's xmpt-inbox skill.
 */
export async function sendXMPTMessage(
  peer: XMPTPeer,
  messageInput: XMPTMessageInput,
  options?: XMPTSendOptions
): Promise<XMPTDeliveryResult> {
  const skillId = options?.skillId ?? DEFAULT_SKILL_ID;
  const baseUrl = resolvePeerUrl(peer);

  // Resolve the agent card
  let card;
  try {
    if ('card' in peer) {
      card = peer.card;
    } else {
      card = await fetchAgentCard(baseUrl);
    }
  } catch (err) {
    throw new XMPTError(
      XMPT_ERROR.PEER_NOT_REACHABLE,
      `Failed to reach peer at ${baseUrl}: ${(err as Error).message}`,
      err
    );
  }

  // Verify the skill exists
  const hasSkill = card.skills?.some((s) => s.id === skillId);
  if (!hasSkill) {
    throw new XMPTError(
      XMPT_ERROR.INBOX_SKILL_MISSING,
      `Remote agent at ${baseUrl} does not have skill "${skillId}". Available skills: ${
        card.skills?.map((s) => s.id).join(', ') ?? 'none'
      }`
    );
  }

  // Build the full message
  const message = buildMessage(messageInput);

  // Send via A2A task-based protocol
  let response;
  try {
    response = await sendMessage(card, skillId, JSON.stringify(message));
  } catch (err) {
    throw new XMPTError(
      XMPT_ERROR.PEER_NOT_REACHABLE,
      `Failed to send message to ${baseUrl}: ${(err as Error).message}`,
      err
    );
  }

  return {
    taskId: response.taskId,
    status: response.status ?? 'submitted',
    messageId: message.id,
  };
}

/**
 * Send an XMPT message and poll until the task completes.
 */
export async function sendXMPTMessageAndWait(
  peer: XMPTPeer,
  messageInput: XMPTMessageInput,
  options?: XMPTSendOptions
): Promise<XMPTDeliveryResult> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  // Initial send
  const delivery = await sendXMPTMessage(peer, messageInput, options);
  const baseUrl = resolvePeerUrl(peer);

  // Fetch the card for polling
  let card;
  try {
    if ('card' in peer) {
      card = peer.card;
    } else {
      card = await fetchAgentCard(baseUrl);
    }
  } catch (err) {
    // If we can't poll, just return initial result
    return delivery;
  }

  // Poll until done or timeout
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    await sleep(pollIntervalMs);

    try {
      const task = await getTask(card, delivery.taskId);
      const status = task.status as string;

      if (isTerminalStatus(status)) {
        return {
          taskId: delivery.taskId,
          status,
          messageId: delivery.messageId,
        };
      }
    } catch (_err) {
      // Polling failed — keep trying
    }
  }

  throw new XMPTError(
    XMPT_ERROR.SEND_TIMEOUT,
    `sendAndWait timed out after ${maxWaitMs}ms for taskId=${delivery.taskId}`
  );
}

function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'canceled', 'cancelled'].includes(status.toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

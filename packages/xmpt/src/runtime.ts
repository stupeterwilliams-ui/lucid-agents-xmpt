import { randomUUID } from 'node:crypto';
import type {
  XMPTRuntime,
  XMPTMessage,
  XMPTPeer,
  XMPTDeliveryResult,
  XMPTSendOptions,
  XMPTContent,
  XMPTMessageFilter,
  XMPTMessageHandler,
  XMPTInboxHandler,
  XMPTInboxReply,
  XMPTStore,
} from '../types/index.js';
import {
  resolvePeerUrl,
  sendViaAgentm,
  sendViaHttp,
  pollTaskUntilComplete,
} from './client.js';
import type { MemoryStore } from './store/memory.js';

export type XMPTRuntimeOptions = {
  transport: 'agentm' | 'http';
  inboxKey: string;
  inboxHandler?: XMPTInboxHandler;
  store: XMPTStore;
  agentUrl?: string; // this agent's own URL (for `from` field)
};

/**
 * Core XMPTRuntime implementation.
 *
 * Exposes: send, sendAndWait, receive, onMessage, listMessages
 */
export class XMPTRuntimeImpl implements XMPTRuntime {
  private subscribers: XMPTMessageHandler[] = [];
  private readonly opts: XMPTRuntimeOptions;

  constructor(opts: XMPTRuntimeOptions) {
    this.opts = opts;
  }

  // ── send ──────────────────────────────────────────────────────────────────

  async send(
    peer: XMTPeer,
    partial: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string },
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult> {
    const message = this._buildMessage(peer, partial);

    // Persist outbound
    await this.opts.store.save(message);

    if (this.opts.transport === 'http') {
      return sendViaHttp(peer, message, this.opts.inboxKey, options);
    }
    return sendViaAgentm(peer, message, {
      ...options,
      metadata: {
        ...options?.metadata,
        inboxKey: this.opts.inboxKey,
      },
    });
  }

  // ── sendAndWait ───────────────────────────────────────────────────────────

  async sendAndWait(
    peer: XMTPeer,
    partial: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string },
    options?: XMPTSendOptions
  ): Promise<{ deliveryResult: XMPTDeliveryResult; reply?: XMPTContent }> {
    const delivery = await this.send(peer, partial, options);

    if (this.opts.transport !== 'agentm') {
      // HTTP transport: no polling support, just return delivery
      return { deliveryResult: delivery };
    }

    const peerUrl = resolvePeerUrl(peer);
    const { output: reply } = await pollTaskUntilComplete(
      peerUrl,
      delivery.taskId,
      options?.timeoutMs ?? 30_000
    );

    return { deliveryResult: delivery, reply };
  }

  // ── receive ───────────────────────────────────────────────────────────────

  async receive(message: XMPTMessage): Promise<XMPTInboxReply> {
    // Persist inbound
    await this.opts.store.save(message);

    let reply: XMPTInboxReply = null;

    if (this.opts.inboxHandler) {
      reply = await this.opts.inboxHandler({ message });
    }

    // Notify subscribers
    for (const sub of this.subscribers) {
      try {
        await sub(message);
      } catch {
        // subscriber errors must not break the receive path
      }
    }

    return reply;
  }

  // ── onMessage ─────────────────────────────────────────────────────────────

  onMessage(handler: XMPTMessageHandler): () => void {
    this.subscribers.push(handler);
    return () => {
      const idx = this.subscribers.indexOf(handler);
      if (idx !== -1) this.subscribers.splice(idx, 1);
    };
  }

  // ── listMessages ─────────────────────────────────────────────────────────

  listMessages(filter?: XMPTMessageFilter): XMPTMessage[] {
    const result = this.opts.store.list(filter);
    // Support both sync and async stores — in MVP the store is always sync
    if (Array.isArray(result)) return result;
    // If it's a Promise, return empty (caller should await store directly)
    return [];
  }

  // ── private ───────────────────────────────────────────────────────────────

  private _buildMessage(
    peer: XMTPeer,
    partial: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string }
  ): XMPTMessage {
    return {
      id: randomUUID(),
      threadId: partial.threadId ?? randomUUID(),
      from: this.opts.agentUrl,
      to: resolvePeerUrl(peer),
      content: partial.content ?? {},
      metadata: partial.metadata,
      createdAt: new Date().toISOString(),
    };
  }
}

export function createXMPTRuntime(opts: XMPTRuntimeOptions): XMPTRuntimeImpl {
  return new XMPTRuntimeImpl(opts);
}

// Re-export type alias so store/memory can import it
export type { XMTPeer };

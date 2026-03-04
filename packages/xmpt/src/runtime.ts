/**
 * XMPT Runtime — the runtime slice exposed as `agent.xmpt`.
 */

import {
  buildMessage,
  deliverMessage,
  deliverAndWait,
  resolvePeerUrl,
  XMPTError,
} from './client.js';
import { createMemoryStore } from './store/memory.js';
import type {
  XMPTMessage,
  XMPTPeer,
  XMPTDeliveryResult,
  XMPTSendOptions,
  XMPTSendAndWaitOptions,
  XMPTListFilters,
  XMPTRuntime,
  XMPTStore,
  XMPTOptions,
  XMPTInboxContext,
  XMPTInboxReply,
} from './types-internal.js';

export type { XMPTRuntime };

export interface XMPTRuntimeInternals extends XMPTRuntime {
  /** Called by the inbox entrypoint handler. */
  _handleInbound(message: XMPTMessage): Promise<XMPTInboxReply | void>;
}

/**
 * Creates the XMPT runtime slice.
 */
export function createXMPTRuntime(options: XMPTOptions): XMPTRuntimeInternals {
  const store: XMPTStore = options.store ?? createMemoryStore();
  const subscribers: Array<(msg: XMPTMessage) => Promise<void> | void> = [];
  const inboxKey = options.inbox?.key ?? 'xmpt-inbox';
  const selfUrl = options.selfUrl ?? inferSelfUrl();

  /** Dispatch to all subscribers. */
  async function notifySubscribers(message: XMPTMessage): Promise<void> {
    for (const handler of subscribers) {
      try {
        await handler(message);
      } catch (err) {
        // Subscribers must not crash the runtime
        console.error('[xmpt] subscriber error:', err);
      }
    }
  }

  return {
    async send(
      peer: XMPTPeer,
      partial: Pick<XMPTMessage, 'content'> & Partial<XMPTMessage>,
      opts?: XMPTSendOptions
    ): Promise<XMPTDeliveryResult> {
      const peerUrl = resolvePeerUrl(peer);
      const message = buildMessage(partial, {
        ...opts,
        selfUrl,
        peerUrl,
      });

      await store.save(message);
      const result = await deliverMessage(peerUrl, message, opts);
      return result;
    },

    async sendAndWait(
      peer: XMPTPeer,
      partial: Pick<XMPTMessage, 'content'> & Partial<XMPTMessage>,
      opts?: XMPTSendAndWaitOptions
    ): Promise<XMPTMessage | null> {
      const peerUrl = resolvePeerUrl(peer);
      const message = buildMessage(partial, {
        ...opts,
        selfUrl,
        peerUrl,
      });

      await store.save(message);
      const reply = await deliverAndWait(peerUrl, message, opts);
      if (reply) {
        await store.save(reply);
      }
      return reply;
    },

    async receive(message: XMPTMessage): Promise<XMPTMessage | void> {
      await store.save(message);
      await notifySubscribers(message);

      if (options.inbox?.handler) {
        const ctx: XMPTInboxContext = { message, skillKey: inboxKey };
        const reply = await options.inbox.handler(ctx);
        if (reply) {
          const replyMsg: XMPTMessage = {
            id: generateReplyId(message.id),
            threadId: message.threadId,
            from: selfUrl,
            to: message.from,
            content: reply.content,
            metadata: reply.metadata,
            createdAt: new Date().toISOString(),
          };
          await store.save(replyMsg);
          return replyMsg;
        }
      }
    },

    onMessage(
      handler: (message: XMPTMessage) => Promise<void> | void
    ): () => void {
      subscribers.push(handler);
      return () => {
        const idx = subscribers.indexOf(handler);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    },

    async listMessages(filters?: XMPTListFilters): Promise<XMPTMessage[]> {
      return store.list(filters);
    },

    // ── Internal ──────────────────────────────────────────────────────────

    async _handleInbound(message: XMPTMessage): Promise<XMPTInboxReply | void> {
      await store.save(message);
      await notifySubscribers(message);

      if (options.inbox?.handler) {
        const ctx: XMPTInboxContext = { message, skillKey: inboxKey };
        return options.inbox.handler(ctx);
      }
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateReplyId(inResponseTo: string): string {
  return `reply-${inResponseTo}-${Date.now()}`;
}

function inferSelfUrl(): string | undefined {
  const port = process.env.PORT;
  if (port) return `http://localhost:${port}`;
  return undefined;
}

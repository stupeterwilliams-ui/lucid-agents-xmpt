/**
 * XMPT Runtime — the object exposed at `runtime.xmpt`.
 *
 * Manages:
 * - Inbox handler registration
 * - Message send/receive dispatch
 * - onMessage subscriptions
 * - In-memory message store
 */

import type { AgentRuntime } from '@lucid-agents/types/core';
import { sendXMPTMessage, sendXMPTMessageAndWait, buildMessage } from './client.js';
import type {
  XMPTRuntime,
  XMPTOptions,
  XMPTMessage,
  XMPTMessageInput,
  XMPTPeer,
  XMPTSendOptions,
  XMPTDeliveryResult,
  XMPTReply,
  XMPTMessageHandler,
  XMPTListFilter,
  XMPTStoredMessage,
} from './types.js';
import { XMPTError, XMPT_ERROR } from './types.js';
import { createMemoryStore } from './store/memory.js';

export function createXMPTRuntime(
  agentRuntime: AgentRuntime,
  options: XMPTOptions
): XMPTRuntime {
  const store = options.store ?? createMemoryStore();
  const inboxHandler = options.inbox?.handler;
  const subscribers: Set<XMPTMessageHandler> = new Set();

  async function send(
    peer: XMPTPeer,
    messageInput: XMPTMessageInput,
    sendOptions?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult> {
    // Enrich message with our identity if possible
    const selfUrl = getSelfUrl(agentRuntime);
    const enriched: XMPTMessageInput = {
      from: messageInput.from ?? selfUrl,
      ...messageInput,
    };

    const result = await sendXMPTMessage(peer, enriched, sendOptions);

    // Store outbound message
    const message = buildMessage(enriched);
    await store.save({ ...message, direction: 'outbound' });

    return result;
  }

  async function sendAndWait(
    peer: XMPTPeer,
    messageInput: XMPTMessageInput,
    sendOptions?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult> {
    const selfUrl = getSelfUrl(agentRuntime);
    const enriched: XMPTMessageInput = {
      from: messageInput.from ?? selfUrl,
      ...messageInput,
    };

    const result = await sendXMPTMessageAndWait(peer, enriched, sendOptions);

    // Store outbound message
    const message = buildMessage(enriched);
    await store.save({ ...message, direction: 'outbound' });

    return result;
  }

  async function receive(message: XMPTMessage): Promise<XMPTReply | undefined> {
    // Validate minimal message shape
    if (!message || typeof message !== 'object') {
      throw new XMPTError(XMPT_ERROR.INVALID_MESSAGE, 'Message must be an object');
    }
    if (!message.content) {
      throw new XMPTError(XMPT_ERROR.INVALID_MESSAGE, 'Message must have a content field');
    }

    // Store inbound
    await store.save({ ...message, direction: 'inbound' });

    // Notify subscribers
    for (const sub of subscribers) {
      try {
        await sub(message);
      } catch (err) {
        console.error('[xmpt] subscriber error:', err);
      }
    }

    // Invoke inbox handler
    if (!inboxHandler) {
      return undefined;
    }

    try {
      const reply = await inboxHandler({ message, runtime: agentRuntime });
      return reply;
    } catch (err) {
      console.error('[xmpt] inbox handler error:', err);
      throw err;
    }
  }

  function onMessage(handler: XMPTMessageHandler): () => void {
    subscribers.add(handler);
    return () => {
      subscribers.delete(handler);
    };
  }

  async function listMessages(filters?: XMPTListFilter): Promise<XMPTStoredMessage[]> {
    return store.list(filters);
  }

  return {
    send,
    sendAndWait,
    receive,
    onMessage,
    listMessages,
  };
}

/**
 * Try to derive the local agent's URL from HTTP extension, or return undefined.
 */
function getSelfUrl(runtime: AgentRuntime): string | undefined {
  // The HTTP extension exposes `runtime.http?.origin` in some versions
  const runtimeAny = runtime as Record<string, unknown>;
  const http = runtimeAny['http'] as Record<string, unknown> | undefined;
  if (http?.origin && typeof http.origin === 'string') {
    return http.origin;
  }
  return undefined;
}

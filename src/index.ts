/**
 * @lucid-agents/xmpt
 *
 * Agent-to-agent messaging extension for the Lucid SDK.
 *
 * @example
 * ```typescript
 * import { createAgent } from '@lucid-agents/core';
 * import { http } from '@lucid-agents/http';
 * import { a2a } from '@lucid-agents/a2a';
 * import { xmpt } from '@lucid-agents/xmpt';
 *
 * const runtime = await createAgent({ name: 'my-agent', version: '0.1.0' })
 *   .use(http())
 *   .use(a2a())
 *   .use(xmpt({
 *     inbox: {
 *       handler: async ({ message }) => ({
 *         content: { text: `ack:${message.content.text}` },
 *       }),
 *     },
 *   }))
 *   .build();
 *
 * await runtime.xmpt.send({ url: 'http://other-agent.example.com' }, {
 *   content: { text: 'hello' },
 *   threadId: 'thread-1',
 * });
 * ```
 */

// Extension factory
export { xmpt, XMPT_INBOX_SKILL_TAG, XMPT_INBOX_DEFAULT_KEY } from './extension.js';

// Runtime factory (for testing / advanced usage)
export { createXMPTRuntime } from './runtime.js';

// Store
export { MemoryXMPTStore, createMemoryStore } from './store/memory.js';

// Types
export type {
  XMPTContent,
  XMPTMessage,
  XMPTMessageInput,
  XMPTReply,
  XMPTPeer,
  XMPTDeliveryResult,
  XMPTHandlerContext,
  XMPTInboxHandler,
  XMPTMessageHandler,
  XMPTStoredMessage,
  XMPTListFilter,
  XMPTStore,
  XMPTSendOptions,
  XMPTRuntime,
  XMPTInboxOptions,
  XMPTDiscoveryOptions,
  XMPTOptions,
  XMPTErrorCode,
} from './types.js';

// Error class + codes
export { XMPTError, XMPT_ERROR } from './types.js';

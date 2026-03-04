/**
 * @lucid-agents/xmpt
 *
 * Agent-to-agent messaging extension for the Lucid SDK.
 *
 * @example
 * ```ts
 * import { createAgent } from '@lucid-agents/core';
 * import { http } from '@lucid-agents/http';
 * import { a2a } from '@lucid-agents/a2a';
 * import { xmpt } from '@lucid-agents/xmpt';
 *
 * const runtime = await createAgent({ name: 'alpha', version: '0.1.0' })
 *   .use(http())
 *   .use(a2a())
 *   .use(
 *     xmpt({
 *       inbox: {
 *         handler: async ({ message }) => ({
 *           content: { text: `ack:${message.content.text ?? ''}` },
 *         }),
 *       },
 *     })
 *   )
 *   .build();
 *
 * await runtime.xmpt.send(
 *   { url: 'http://localhost:8788' },
 *   { content: { text: 'hello' }, threadId: 't-1' }
 * );
 * ```
 */

export { xmpt } from './extension.js';
export { createXMPTRuntime } from './runtime.js';
export { createMemoryStore } from './store/memory.js';
export { XMPTError, XMPTMessageSchema, resolvePeerUrl, buildMessage, generateMessageId } from './client.js';

export type {
  XMPTContent,
  XMPTMessage,
  XMPTPeer,
  XMPTDeliveryResult,
  XMPTStore,
  XMPTListFilters,
  XMPTSendOptions,
  XMPTSendAndWaitOptions,
  XMPTRuntime,
  XMPTOptions,
  XMPTInboxContext,
  XMPTInboxReply,
} from './types-internal.js';

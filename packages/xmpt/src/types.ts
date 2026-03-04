/**
 * Re-export of all XMPT types used internally by this package.
 * Keeping types co-located makes this package self-contained for
 * independent publication. When merged into the monorepo, these would
 * live in @lucid-agents/types/xmpt.
 */

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

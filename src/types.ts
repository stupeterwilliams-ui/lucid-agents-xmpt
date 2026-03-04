/**
 * @lucid-agents/xmpt — Type Definitions
 *
 * All XMPT types live here. These will eventually live in @lucid-agents/types/xmpt
 * once the package is merged into the monorepo.
 */

import type { AgentRuntime } from '@lucid-agents/types/core';
import type { AgentCard } from '@lucid-agents/types/a2a';

// ─── Content ─────────────────────────────────────────────────────────────────

/** The content payload of an XMPT message. */
export interface XMPTContent {
  text?: string;
  data?: unknown;
  mime?: string;
}

// ─── Message ─────────────────────────────────────────────────────────────────

/** A fully-hydrated, immutable XMPT message. */
export interface XMPTMessage {
  /** Unique message ID (UUID). */
  id: string;
  /** Optional thread ID for grouping related messages. */
  threadId?: string;
  /** Sender URL or identifier. */
  from?: string;
  /** Recipient URL or identifier. */
  to?: string;
  /** Message content. */
  content: XMPTContent;
  /** Optional freeform metadata. */
  metadata?: Record<string, unknown>;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** Input shape for constructing a message (id/createdAt auto-generated). */
export type XMPTMessageInput = Omit<XMPTMessage, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

/** Optional reply returned by an inbox handler. */
export interface XMPTReply {
  content: XMPTContent;
  metadata?: Record<string, unknown>;
}

// ─── Peer ────────────────────────────────────────────────────────────────────

/** A remote agent peer — either a URL or a resolved AgentCard. */
export type XMPTPeer = { url: string } | { card: AgentCard };

// ─── Delivery Result ─────────────────────────────────────────────────────────

/** Result of a successful send operation. */
export interface XMPTDeliveryResult {
  /** A2A task ID for tracking. */
  taskId: string;
  /** Task status at time of return. */
  status: string;
  /** XMPT message ID sent. */
  messageId: string;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/** Context passed to the inbox handler. */
export interface XMPTHandlerContext {
  message: XMPTMessage;
  runtime: AgentRuntime;
}

/** Inbox handler: receives a message, returns optional reply. */
export type XMPTInboxHandler = (
  ctx: XMPTHandlerContext
) => Promise<XMPTReply | undefined>;

/** Subscription handler for onMessage(). */
export type XMPTMessageHandler = (message: XMPTMessage) => void | Promise<void>;

// ─── Store ───────────────────────────────────────────────────────────────────

/** A stored message with direction metadata. */
export interface XMPTStoredMessage extends XMPTMessage {
  direction: 'inbound' | 'outbound';
}

/** Filter options for listMessages(). */
export interface XMPTListFilter {
  threadId?: string;
  direction?: 'inbound' | 'outbound';
  from?: string;
  to?: string;
  since?: string; // ISO-8601
  limit?: number;
}

/** Pluggable message store. Default is in-memory. */
export interface XMPTStore {
  save(message: XMPTStoredMessage): Promise<void>;
  list(filters?: XMPTListFilter): Promise<XMPTStoredMessage[]>;
}

// ─── Send Options ────────────────────────────────────────────────────────────

export interface XMPTSendOptions {
  /** Target skill ID on the remote agent. Defaults to 'xmpt-inbox'. */
  skillId?: string;
  /** Max ms to poll when using sendAndWait. Default: 30000. */
  maxWaitMs?: number;
  /** Poll interval when using sendAndWait. Default: 1000. */
  pollIntervalMs?: number;
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

/** The runtime API exposed at `runtime.xmpt`. */
export interface XMPTRuntime {
  /**
   * Send a message to a remote agent. Returns immediately after delivery.
   */
  send(
    peer: XMPTPeer,
    message: XMPTMessageInput,
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult>;

  /**
   * Send a message and poll until the remote task completes (or times out).
   */
  sendAndWait(
    peer: XMPTPeer,
    message: XMPTMessageInput,
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult>;

  /**
   * Dispatch a message to the local inbox handler.
   * Used internally by the inbox skill; can also be called directly in tests.
   */
  receive(message: XMPTMessage): Promise<XMPTReply | undefined>;

  /**
   * Subscribe to all inbound messages. Returns an unsubscribe function.
   */
  onMessage(handler: XMPTMessageHandler): () => void;

  /**
   * List stored messages with optional filters.
   */
  listMessages(filters?: XMPTListFilter): Promise<XMPTStoredMessage[]>;
}

// ─── Extension Options ────────────────────────────────────────────────────────

export interface XMPTInboxOptions {
  /** Skill key registered in the agent card. Default: 'xmpt-inbox'. */
  key?: string;
  /** Inbox message handler. */
  handler: XMPTInboxHandler;
}

export interface XMPTDiscoveryOptions {
  /** Preferred skill ID to look for on the remote agent. Default: 'xmpt-inbox'. */
  preferredSkillId?: string;
}

export interface XMPTOptions {
  /** Inbox configuration. If omitted, the agent can only send. */
  inbox?: XMPTInboxOptions;
  /** Pluggable store. Defaults to in-memory. */
  store?: XMPTStore;
  /** Discovery options. */
  discovery?: XMPTDiscoveryOptions;
}

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const XMPT_ERROR = {
  PEER_NOT_REACHABLE: 'XMPT_PEER_NOT_REACHABLE',
  INBOX_SKILL_MISSING: 'XMPT_INBOX_SKILL_MISSING',
  INVALID_MESSAGE: 'XMPT_INVALID_MESSAGE',
  SEND_TIMEOUT: 'XMPT_SEND_TIMEOUT',
  NO_INBOX_CONFIGURED: 'XMPT_NO_INBOX_CONFIGURED',
} as const;

export type XMPTErrorCode = (typeof XMPT_ERROR)[keyof typeof XMPT_ERROR];

export class XMPTError extends Error {
  public readonly code: XMPTErrorCode;

  constructor(code: XMPTErrorCode, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'XMPTError';
    this.code = code;
  }
}

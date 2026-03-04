/**
 * @lucid-agents/xmpt — Type definitions
 *
 * These types mirror the design from @lucid-agents/types/xmpt as specified in
 * https://github.com/daydreamsai/lucid-agents/issues/171
 */

// ─── Message content ─────────────────────────────────────────────────────────

export type XMPTContent = {
  text?: string;
  data?: unknown;
  mime?: string;
};

// ─── Message envelope ────────────────────────────────────────────────────────

export type XMPTMessage = {
  id: string;
  threadId: string;
  from?: string;
  to?: string;
  content: XMPTContent;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

// ─── Peer resolution ─────────────────────────────────────────────────────────

export type XMPTPeer = { url: string } | { card: AgentCardRef };

export type AgentCardRef = {
  url?: string;
  name?: string;
  [key: string]: unknown;
};

// ─── Delivery result ─────────────────────────────────────────────────────────

export type XMPTDeliveryResult = {
  taskId: string;
  status: string;
  messageId: string;
};

// ─── Send options ────────────────────────────────────────────────────────────

export type XMPTSendOptions = {
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

// ─── Message filters ─────────────────────────────────────────────────────────

export type XMPTMessageFilter = {
  threadId?: string;
  from?: string;
  to?: string;
  since?: string; // ISO timestamp
  limit?: number;
};

// ─── Message handler ─────────────────────────────────────────────────────────

export type XMPTMessageHandler = (
  message: XMPTMessage
) => Promise<void> | void;

// ─── Inbox handler ───────────────────────────────────────────────────────────

export type XMPTInboxHandlerContext = {
  message: XMPTMessage;
};

export type XMPTInboxReply = {
  content: XMPTContent;
  metadata?: Record<string, unknown>;
} | void | null;

export type XMPTInboxHandler = (
  ctx: XMPTInboxHandlerContext
) => Promise<XMPTInboxReply> | XMPTInboxReply;

// ─── Store interface ─────────────────────────────────────────────────────────

export interface XMPTStore {
  save(message: XMPTMessage): Promise<void> | void;
  list(filter?: XMPTMessageFilter): Promise<XMPTMessage[]> | XMPTMessage[];
  get(id: string): Promise<XMPTMessage | undefined> | XMPTMessage | undefined;
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

export interface XMPTRuntime {
  /**
   * Send a message to a peer agent.
   * Fire-and-forget (does not wait for processing).
   */
  send(
    peer: XMTPeer,
    message: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string },
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult>;

  /**
   * Send a message and wait for the peer to process it.
   * Returns the result once the task reaches completed/failed state.
   */
  sendAndWait(
    peer: XMTPeer,
    message: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string },
    options?: XMPTSendOptions
  ): Promise<{ deliveryResult: XMPTDeliveryResult; reply?: XMPTContent }>;

  /**
   * Dispatch a message to the local inbox handler (inbound receive).
   */
  receive(message: XMPTMessage): Promise<XMPTInboxReply>;

  /**
   * Subscribe to all incoming messages (after inbox handler runs).
   * Returns an unsubscribe function.
   */
  onMessage(handler: XMPTMessageHandler): () => void;

  /**
   * List messages from the store with optional filters.
   */
  listMessages(filter?: XMPTMessageFilter): XMPTMessage[];
}

// Fix typo alias — XMTPeer exposed as well for ergonomics
export type XMTPeer = XMPTPeer;

// ─── Extension options ───────────────────────────────────────────────────────

export type XMPTOptions = {
  /**
   * Transport protocol. 'agentm' uses A2A task-based protocol (default).
   * 'http' uses direct HTTP POST to the peer's inbox skill.
   */
  transport?: 'agentm' | 'http';

  inbox?: {
    /** Skill key for the inbox entrypoint (default: 'xmpt-inbox') */
    key?: string;
    /** Handler for incoming messages */
    handler: XMPTInboxHandler;
  };

  /** Message store. Default: in-memory store. */
  store?: XMPTStore;

  discovery?: {
    /** Override the preferred skill ID used during peer discovery. */
    preferredSkillId?: string;
  };
};

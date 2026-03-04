/**
 * XMPT type definitions (internal copy — for upstream contribution to @lucid-agents/types).
 */

// ─── Content & Message ──────────────────────────────────────────────────────

export type XMPTContent = {
  text?: string;
  data?: unknown;
  mime?: string;
};

export type XMPTPeer = { url: string } | { card: Record<string, unknown> };

export type XMPTMessage = {
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  content: XMPTContent;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type XMPTDeliveryResult = {
  taskId: string;
  status: string;
  messageId: string;
};

// ─── Store ───────────────────────────────────────────────────────────────────

export type XMPTListFilters = {
  threadId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type XMPTStore = {
  save(message: XMPTMessage): Promise<void>;
  list(filters?: XMPTListFilters): Promise<XMPTMessage[]>;
  get(id: string): Promise<XMPTMessage | undefined>;
};

// ─── Runtime ─────────────────────────────────────────────────────────────────

export type XMPTSendOptions = {
  threadId?: string;
  metadata?: Record<string, unknown>;
  skillId?: string;
};

export type XMPTSendAndWaitOptions = XMPTSendOptions & {
  timeoutMs?: number;
};

export type XMPTRuntime = {
  send(
    peer: XMPTPeer,
    message: Pick<XMPTMessage, 'content'> & Partial<XMPTMessage>,
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult>;

  sendAndWait(
    peer: XMPTPeer,
    message: Pick<XMPTMessage, 'content'> & Partial<XMPTMessage>,
    options?: XMPTSendAndWaitOptions
  ): Promise<XMPTMessage | null>;

  receive(message: XMPTMessage): Promise<XMPTMessage | void>;

  onMessage(
    handler: (message: XMPTMessage) => Promise<void> | void
  ): () => void;

  listMessages(filters?: XMPTListFilters): Promise<XMPTMessage[]>;
};

// ─── Extension options ────────────────────────────────────────────────────────

export type XMPTInboxContext = {
  message: XMPTMessage;
  skillKey: string;
};

export type XMPTInboxReply = {
  content: XMPTContent;
  metadata?: Record<string, unknown>;
};

export type XMPTOptions = {
  inbox?: {
    key?: string;
    handler: (ctx: XMPTInboxContext) => Promise<XMPTInboxReply | void>;
  };
  store?: XMPTStore;
  discovery?: {
    preferredSkillId?: string;
  };
  selfUrl?: string;
};

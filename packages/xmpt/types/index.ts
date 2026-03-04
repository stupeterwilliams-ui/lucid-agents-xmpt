/**
 * Inline type definitions for @lucid-agents/xmpt
 * (mirrors @lucid-agents/types/xmpt from the PRD)
 */

export type XMPTContent = {
  text?: string;
  data?: unknown;
  mime?: string;
};

export type XMPTMessage = {
  id: string;
  threadId: string;
  from?: string;
  to?: string;
  content: XMPTContent;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type XMPTPeer = { url: string } | { card: { url?: string; name?: string; [key: string]: unknown } };
export type XMTPeer = XMPTPeer;

export type XMPTDeliveryResult = {
  taskId: string;
  status: string;
  messageId: string;
};

export type XMPTSendOptions = {
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

export type XMPTMessageFilter = {
  threadId?: string;
  from?: string;
  to?: string;
  since?: string;
  limit?: number;
};

export type XMPTMessageHandler = (message: XMPTMessage) => Promise<void> | void;

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

export interface XMPTStore {
  save(message: XMPTMessage): Promise<void> | void;
  list(filter?: XMPTMessageFilter): Promise<XMPTMessage[]> | XMPTMessage[];
  get(id: string): Promise<XMPTMessage | undefined> | XMPTMessage | undefined;
}

export interface XMPTRuntime {
  send(
    peer: XMTPeer,
    message: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string },
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult>;

  sendAndWait(
    peer: XMTPeer,
    message: Omit<XMPTMessage, 'id' | 'createdAt'> & { threadId?: string },
    options?: XMPTSendOptions
  ): Promise<{ deliveryResult: XMPTDeliveryResult; reply?: XMPTContent }>;

  receive(message: XMPTMessage): Promise<XMPTInboxReply>;

  onMessage(handler: XMPTMessageHandler): () => void;

  listMessages(filter?: XMPTMessageFilter): XMPTMessage[];
}

export type XMPTOptions = {
  transport?: 'agentm' | 'http';
  inbox?: {
    key?: string;
    handler: XMPTInboxHandler;
  };
  store?: XMPTStore;
  discovery?: {
    preferredSkillId?: string;
  };
};

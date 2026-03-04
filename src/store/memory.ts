/**
 * In-memory XMPT message store.
 * Default store used unless a custom one is provided.
 */

import type { XMPTStore, XMPTStoredMessage, XMPTListFilter } from '../types.js';

export class MemoryXMPTStore implements XMPTStore {
  private messages: XMPTStoredMessage[] = [];

  async save(message: XMPTStoredMessage): Promise<void> {
    this.messages.push({ ...message });
  }

  async list(filters?: XMPTListFilter): Promise<XMPTStoredMessage[]> {
    let results = this.messages.slice();

    if (filters?.threadId !== undefined) {
      results = results.filter((m) => m.threadId === filters.threadId);
    }

    if (filters?.direction !== undefined) {
      results = results.filter((m) => m.direction === filters.direction);
    }

    if (filters?.from !== undefined) {
      results = results.filter((m) => m.from === filters.from);
    }

    if (filters?.to !== undefined) {
      results = results.filter((m) => m.to === filters.to);
    }

    if (filters?.since !== undefined) {
      const sinceTs = new Date(filters.since).getTime();
      results = results.filter(
        (m) => new Date(m.createdAt).getTime() >= sinceTs
      );
    }

    if (filters?.limit !== undefined && filters.limit > 0) {
      results = results.slice(-filters.limit);
    }

    return results;
  }

  /** Helper for tests: clear all messages. */
  clear(): void {
    this.messages = [];
  }

  /** Helper for tests: get raw count. */
  count(): number {
    return this.messages.length;
  }
}

export function createMemoryStore(): XMPTStore {
  return new MemoryXMPTStore();
}

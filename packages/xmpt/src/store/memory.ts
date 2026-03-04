import type { XMPTMessage, XMPTMessageFilter, XMPTStore } from '../../types/index.js';

/**
 * In-memory message store.
 * Stores all messages in a simple array. No persistence across restarts.
 * This is the default MVP store — persistence is deferred.
 */
export class MemoryStore implements XMPTStore {
  private messages: XMPTMessage[] = [];

  save(message: XMPTMessage): void {
    this.messages.push(message);
  }

  list(filter?: XMPTMessageFilter): XMPTMessage[] {
    let result = [...this.messages];

    if (filter?.threadId) {
      result = result.filter(m => m.threadId === filter.threadId);
    }
    if (filter?.from) {
      result = result.filter(m => m.from === filter.from);
    }
    if (filter?.to) {
      result = result.filter(m => m.to === filter.to);
    }
    if (filter?.since) {
      const since = new Date(filter.since).getTime();
      result = result.filter(
        m => new Date(m.createdAt).getTime() >= since
      );
    }
    if (filter?.limit !== undefined) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  get(id: string): XMPTMessage | undefined {
    return this.messages.find(m => m.id === id);
  }

  /** Clears all messages. Useful in tests. */
  clear(): void {
    this.messages = [];
  }
}

export function createMemoryStore(): MemoryStore {
  return new MemoryStore();
}

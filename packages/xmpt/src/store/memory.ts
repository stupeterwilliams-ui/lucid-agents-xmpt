/**
 * In-memory implementation of XMPTStore.
 * Messages are lost on process restart. For production, replace with
 * a persistent store (SQLite, Postgres, Redis, etc.).
 */

import type { XMPTMessage, XMPTStore, XMPTListFilters } from '../types.js';

export class MemoryStore implements XMPTStore {
  private readonly messages = new Map<string, XMPTMessage>();

  async save(message: XMPTMessage): Promise<void> {
    this.messages.set(message.id, message);
  }

  async get(id: string): Promise<XMPTMessage | undefined> {
    return this.messages.get(id);
  }

  async list(filters?: XMPTListFilters): Promise<XMPTMessage[]> {
    let results = Array.from(this.messages.values());

    if (filters?.threadId) {
      results = results.filter(m => m.threadId === filters.threadId);
    }
    if (filters?.from) {
      results = results.filter(m => m.from === filters.from);
    }
    if (filters?.to) {
      results = results.filter(m => m.to === filters.to);
    }

    // Sort newest first
    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /** Returns total number of stored messages (useful in tests). */
  size(): number {
    return this.messages.size;
  }

  /** Clears all stored messages. */
  clear(): void {
    this.messages.clear();
  }
}

/** Creates a new in-memory store instance. */
export function createMemoryStore(): XMPTStore {
  return new MemoryStore();
}

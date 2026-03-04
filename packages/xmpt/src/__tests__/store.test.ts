import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryStore } from '../store/memory.js';
import type { XMPTMessage } from '../types-internal.js';

function makeMsg(overrides: Partial<XMPTMessage> = {}): XMPTMessage {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    content: { text: 'hello' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('saves and retrieves a message by id', async () => {
    const msg = makeMsg({ id: 'test-1' });
    await store.save(msg);
    const retrieved = await store.get('test-1');
    expect(retrieved).toEqual(msg);
  });

  it('returns undefined for unknown id', async () => {
    const retrieved = await store.get('does-not-exist');
    expect(retrieved).toBeUndefined();
  });

  it('lists all messages', async () => {
    const m1 = makeMsg({ id: 'm1', createdAt: new Date(1000).toISOString() });
    const m2 = makeMsg({ id: 'm2', createdAt: new Date(2000).toISOString() });
    await store.save(m1);
    await store.save(m2);
    const list = await store.list();
    expect(list).toHaveLength(2);
  });

  it('filters by threadId', async () => {
    await store.save(makeMsg({ id: 'a', threadId: 'thread-1' }));
    await store.save(makeMsg({ id: 'b', threadId: 'thread-2' }));
    await store.save(makeMsg({ id: 'c', threadId: 'thread-1' }));

    const result = await store.list({ threadId: 'thread-1' });
    expect(result).toHaveLength(2);
    expect(result.every(m => m.threadId === 'thread-1')).toBe(true);
  });

  it('filters by from', async () => {
    await store.save(makeMsg({ id: 'x', from: 'http://agent-a:3000' }));
    await store.save(makeMsg({ id: 'y', from: 'http://agent-b:3001' }));
    const result = await store.list({ from: 'http://agent-a:3000' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('x');
  });

  it('respects limit and offset', async () => {
    for (let i = 0; i < 10; i++) {
      await store.save(makeMsg({ id: `m${i}`, createdAt: new Date(i * 1000).toISOString() }));
    }
    const page1 = await store.list({ limit: 3, offset: 0 });
    const page2 = await store.list({ limit: 3, offset: 3 });
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);
    // No overlap
    const ids1 = new Set(page1.map(m => m.id));
    expect(page2.every(m => !ids1.has(m.id))).toBe(true);
  });

  it('returns messages sorted newest-first', async () => {
    await store.save(makeMsg({ id: 'old', createdAt: new Date(1000).toISOString() }));
    await store.save(makeMsg({ id: 'new', createdAt: new Date(9000).toISOString() }));
    const [first] = await store.list();
    expect(first.id).toBe('new');
  });

  it('size() reflects saved count', async () => {
    expect(store.size()).toBe(0);
    await store.save(makeMsg());
    await store.save(makeMsg());
    expect(store.size()).toBe(2);
  });

  it('clear() removes all messages', async () => {
    await store.save(makeMsg());
    store.clear();
    expect(store.size()).toBe(0);
  });
});

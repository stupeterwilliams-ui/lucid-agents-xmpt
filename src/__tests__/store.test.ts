/**
 * Tests: In-memory store
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryXMPTStore } from '../store/memory.js';
import type { XMPTStoredMessage } from '../types.js';

function makeMessage(overrides: Partial<XMPTStoredMessage> = {}): XMPTStoredMessage {
  return {
    id: crypto.randomUUID(),
    content: { text: 'hello' },
    createdAt: new Date().toISOString(),
    direction: 'inbound',
    ...overrides,
  };
}

describe('MemoryXMPTStore', () => {
  let store: MemoryXMPTStore;

  beforeEach(() => {
    store = new MemoryXMPTStore();
  });

  it('saves and lists messages', async () => {
    const msg = makeMessage();
    await store.save(msg);
    const messages = await store.list();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe(msg.id);
  });

  it('filters by threadId', async () => {
    await store.save(makeMessage({ threadId: 'thread-1' }));
    await store.save(makeMessage({ threadId: 'thread-2' }));
    await store.save(makeMessage({ threadId: 'thread-1' }));

    const results = await store.list({ threadId: 'thread-1' });
    expect(results).toHaveLength(2);
    expect(results.every((m) => m.threadId === 'thread-1')).toBe(true);
  });

  it('filters by direction', async () => {
    await store.save(makeMessage({ direction: 'inbound' }));
    await store.save(makeMessage({ direction: 'outbound' }));
    await store.save(makeMessage({ direction: 'inbound' }));

    const inbound = await store.list({ direction: 'inbound' });
    expect(inbound).toHaveLength(2);

    const outbound = await store.list({ direction: 'outbound' });
    expect(outbound).toHaveLength(1);
  });

  it('filters by from', async () => {
    await store.save(makeMessage({ from: 'http://agent-a.local' }));
    await store.save(makeMessage({ from: 'http://agent-b.local' }));

    const results = await store.list({ from: 'http://agent-a.local' });
    expect(results).toHaveLength(1);
    expect(results[0]?.from).toBe('http://agent-a.local');
  });

  it('filters by to', async () => {
    await store.save(makeMessage({ to: 'http://agent-b.local' }));
    await store.save(makeMessage({ to: 'http://agent-c.local' }));

    const results = await store.list({ to: 'http://agent-b.local' });
    expect(results).toHaveLength(1);
  });

  it('filters by since', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    const old = makeMessage({ createdAt: past });
    const recent = makeMessage({ createdAt: future });
    await store.save(old);
    await store.save(recent);

    const results = await store.list({ since: new Date().toISOString() });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(recent.id);
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await store.save(makeMessage());
    }
    const results = await store.list({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('returns all messages with no filter', async () => {
    for (let i = 0; i < 3; i++) {
      await store.save(makeMessage());
    }
    const results = await store.list();
    expect(results).toHaveLength(3);
  });

  it('can be cleared', async () => {
    await store.save(makeMessage());
    store.clear();
    expect(store.count()).toBe(0);
    const results = await store.list();
    expect(results).toHaveLength(0);
  });

  it('preserves threadId across send/receive round trip', async () => {
    const threadId = 'thread-roundtrip';
    const sent = makeMessage({ threadId, direction: 'outbound' });
    const received = makeMessage({ threadId, direction: 'inbound' });
    await store.save(sent);
    await store.save(received);

    const thread = await store.list({ threadId });
    expect(thread).toHaveLength(2);
    expect(thread.map((m) => m.direction).sort()).toEqual(['inbound', 'outbound']);
  });
});

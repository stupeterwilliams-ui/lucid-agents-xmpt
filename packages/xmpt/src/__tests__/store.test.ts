/**
 * Unit tests: MemoryStore
 * TDD Milestone 3: Threading + Store
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { createMemoryStore } from '../store/memory.js';
import type { XMPTMessage } from '../../types/index.js';

function makeMessage(overrides: Partial<XMPTMessage> = {}): XMPTMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    threadId: 'thread-1',
    from: 'http://agent-a:8787',
    to: 'http://agent-b:8788',
    content: { text: 'hello' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MemoryStore', () => {
  let store: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    store = createMemoryStore();
  });

  it('should start empty', () => {
    expect(store.list()).toHaveLength(0);
  });

  it('should save and retrieve a message', () => {
    const msg = makeMessage();
    store.save(msg);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toEqual(msg);
  });

  it('should get a message by id', () => {
    const msg = makeMessage({ id: 'specific-id' });
    store.save(msg);
    expect(store.get('specific-id')).toEqual(msg);
  });

  it('should return undefined for unknown id', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('should filter by threadId', () => {
    store.save(makeMessage({ threadId: 'thread-1' }));
    store.save(makeMessage({ threadId: 'thread-2' }));
    store.save(makeMessage({ threadId: 'thread-1' }));

    const thread1 = store.list({ threadId: 'thread-1' });
    expect(thread1).toHaveLength(2);
    thread1.forEach(m => expect(m.threadId).toBe('thread-1'));
  });

  it('should filter by from', () => {
    store.save(makeMessage({ from: 'http://agent-a:8787' }));
    store.save(makeMessage({ from: 'http://agent-b:8788' }));
    const fromA = store.list({ from: 'http://agent-a:8787' });
    expect(fromA).toHaveLength(1);
  });

  it('should filter by to', () => {
    store.save(makeMessage({ to: 'http://agent-b:8788' }));
    store.save(makeMessage({ to: 'http://agent-c:8789' }));
    const toB = store.list({ to: 'http://agent-b:8788' });
    expect(toB).toHaveLength(1);
  });

  it('should filter by since timestamp', () => {
    const early = makeMessage({
      createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
    });
    const late = makeMessage({
      createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    });
    store.save(early);
    store.save(late);
    const recent = store.list({ since: '2024-06-01T00:00:00Z' });
    expect(recent).toHaveLength(1);
    expect(recent[0].createdAt).toBe(late.createdAt);
  });

  it('should respect limit filter', () => {
    for (let i = 0; i < 10; i++) store.save(makeMessage());
    expect(store.list({ limit: 3 })).toHaveLength(3);
  });

  it('should preserve threadId across multiple saves', () => {
    const t = 'thread-xyz';
    store.save(makeMessage({ threadId: t, content: { text: 'msg1' } }));
    store.save(makeMessage({ threadId: t, content: { text: 'msg2' } }));
    store.save(makeMessage({ threadId: t, content: { text: 'msg3' } }));

    const thread = store.list({ threadId: t });
    expect(thread).toHaveLength(3);
    expect(thread.map(m => m.content.text)).toEqual(['msg1', 'msg2', 'msg3']);
  });

  it('should clear all messages', () => {
    store.save(makeMessage());
    store.save(makeMessage());
    store.clear();
    expect(store.list()).toHaveLength(0);
  });
});

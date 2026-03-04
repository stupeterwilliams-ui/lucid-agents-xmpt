/**
 * Unit tests: XMPTRuntime
 * TDD Milestones 2 & 3: Send/Receive + Threading
 */
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createXMPTRuntime } from '../runtime.js';
import { createMemoryStore } from '../store/memory.js';
import type { XMPTMessage, XMPTInboxHandler } from '../../types/index.js';

function makeRuntime(opts: {
  inboxHandler?: XMPTInboxHandler;
  transport?: 'agentm' | 'http';
}) {
  return createXMPTRuntime({
    transport: opts.transport ?? 'http',
    inboxKey: 'xmpt-inbox',
    inboxHandler: opts.inboxHandler,
    store: createMemoryStore(),
    agentUrl: 'http://agent-a:8787',
  });
}

describe('XMPTRuntime.receive', () => {
  it('calls inbox handler with the message', async () => {
    const received: XMPTMessage[] = [];
    const runtime = makeRuntime({
      inboxHandler: async ({ message }) => {
        received.push(message);
        return null;
      },
    });

    const msg: XMPTMessage = {
      id: 'msg-1',
      threadId: 't-1',
      content: { text: 'ping' },
      createdAt: new Date().toISOString(),
    };

    await runtime.receive(msg);
    expect(received).toHaveLength(1);
    expect(received[0].content.text).toBe('ping');
  });

  it('returns the handler reply', async () => {
    const runtime = makeRuntime({
      inboxHandler: async ({ message }) => ({
        content: { text: `ack:${message.content.text ?? ''}` },
      }),
    });

    const reply = await runtime.receive({
      id: 'msg-2',
      threadId: 't-2',
      content: { text: 'hello' },
      createdAt: new Date().toISOString(),
    });

    expect(reply).toBeDefined();
    expect((reply as any)?.content?.text).toBe('ack:hello');
  });

  it('persists message to store', async () => {
    const store = createMemoryStore();
    const runtime = createXMPTRuntime({
      transport: 'http',
      inboxKey: 'xmpt-inbox',
      store,
      agentUrl: 'http://agent-a:8787',
    });

    await runtime.receive({
      id: 'stored-msg',
      threadId: 't-store',
      content: { text: 'store me' },
      createdAt: new Date().toISOString(),
    });

    expect(store.get('stored-msg')).toBeDefined();
  });

  it('notifies onMessage subscribers', async () => {
    const runtime = makeRuntime({});
    const events: XMPTMessage[] = [];
    runtime.onMessage(msg => { events.push(msg); });

    await runtime.receive({
      id: 'notif-1',
      threadId: 't-notif',
      content: { text: 'notify me' },
      createdAt: new Date().toISOString(),
    });

    expect(events).toHaveLength(1);
  });

  it('works with no inbox handler (no error)', async () => {
    const runtime = makeRuntime({});
    const reply = await runtime.receive({
      id: 'no-handler',
      threadId: 't-none',
      content: { text: 'no handler' },
      createdAt: new Date().toISOString(),
    });
    expect(reply).toBeNull();
  });
});

describe('XMPTRuntime.onMessage', () => {
  it('returns unsubscribe function', async () => {
    const runtime = makeRuntime({});
    const events: XMPTMessage[] = [];
    const unsub = runtime.onMessage(msg => { events.push(msg); });

    await runtime.receive({
      id: 'ev-1',
      threadId: 't-ev',
      content: { text: 'first' },
      createdAt: new Date().toISOString(),
    });

    unsub(); // remove subscriber

    await runtime.receive({
      id: 'ev-2',
      threadId: 't-ev',
      content: { text: 'second' },
      createdAt: new Date().toISOString(),
    });

    expect(events).toHaveLength(1); // only the first one
  });

  it('supports multiple subscribers', async () => {
    const runtime = makeRuntime({});
    const a: string[] = [];
    const b: string[] = [];
    runtime.onMessage(m => { a.push(m.id); });
    runtime.onMessage(m => { b.push(m.id); });

    await runtime.receive({
      id: 'multi-1',
      threadId: 't-multi',
      content: { text: 'both' },
      createdAt: new Date().toISOString(),
    });

    expect(a).toEqual(['multi-1']);
    expect(b).toEqual(['multi-1']);
  });
});

describe('XMPTRuntime.listMessages', () => {
  it('returns messages filtered by threadId', async () => {
    const runtime = makeRuntime({});
    const msgs = [
      { id: 'a', threadId: 'thread-A', content: { text: 'a' }, createdAt: new Date().toISOString() },
      { id: 'b', threadId: 'thread-B', content: { text: 'b' }, createdAt: new Date().toISOString() },
      { id: 'c', threadId: 'thread-A', content: { text: 'c' }, createdAt: new Date().toISOString() },
    ];
    for (const m of msgs) await runtime.receive(m);

    const result = runtime.listMessages({ threadId: 'thread-A' });
    expect(result).toHaveLength(2);
    result.forEach(m => expect(m.threadId).toBe('thread-A'));
  });
});

describe('XMPTRuntime.send (mocked fetch)', () => {
  it('builds outbound message with threadId and from', async () => {
    const store = createMemoryStore();
    const runtime = createXMPTRuntime({
      transport: 'http',
      inboxKey: 'xmpt-inbox',
      store,
      agentUrl: 'http://agent-a:8787',
    });

    // Patch global fetch temporarily
    const originalFetch = globalThis.fetch;
    let capturedUrl: string | undefined;
    let capturedBody: any;
    (globalThis as any).fetch = async (url: string, init?: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body ?? '{}');
      return {
        ok: true,
        json: async () => ({ taskId: 'mock-task', status: 'delivered' }),
      };
    };

    try {
      const result = await runtime.send(
        { url: 'http://agent-b:8788' },
        { content: { text: 'hello world' }, threadId: 'fixed-thread' }
      );

      expect(capturedUrl).toBe('http://agent-b:8788/xmpt/inbox');
      expect(capturedBody.content.text).toBe('hello world');
      expect(capturedBody.threadId).toBe('fixed-thread');
      expect(capturedBody.from).toBe('http://agent-a:8787');
      expect(result.messageId).toBeDefined();

      // Message should be persisted
      const stored = store.list({ threadId: 'fixed-thread' });
      expect(stored).toHaveLength(1);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

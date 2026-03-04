import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { createXMPTRuntime } from '../runtime.js';
import { MemoryStore } from '../store/memory.js';
import type { XMPTMessage } from '../types-internal.js';

function makeInboundMsg(overrides: Partial<XMPTMessage> = {}): XMPTMessage {
  return {
    id: `inbound-${Date.now()}`,
    content: { text: 'ping' },
    createdAt: new Date().toISOString(),
    from: 'http://sender:3001',
    ...overrides,
  };
}

describe('createXMPTRuntime', () => {
  it('exposes the expected API surface', () => {
    const rt = createXMPTRuntime({});
    expect(typeof rt.send).toBe('function');
    expect(typeof rt.sendAndWait).toBe('function');
    expect(typeof rt.receive).toBe('function');
    expect(typeof rt.onMessage).toBe('function');
    expect(typeof rt.listMessages).toBe('function');
    expect(typeof rt._handleInbound).toBe('function');
  });
});

describe('receive()', () => {
  it('saves the message to the store', async () => {
    const store = new MemoryStore();
    const rt = createXMPTRuntime({ store });
    const msg = makeInboundMsg({ id: 'r1' });
    await rt.receive(msg);
    expect(store.size()).toBe(1);
    expect(await store.get('r1')).toEqual(msg);
  });

  it('notifies subscribers', async () => {
    const received: XMPTMessage[] = [];
    const rt = createXMPTRuntime({});
    rt.onMessage(m => { received.push(m); });
    const msg = makeInboundMsg();
    await rt.receive(msg);
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(msg.id);
  });

  it('calls inbox handler and returns reply', async () => {
    const rt = createXMPTRuntime({
      inbox: {
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text}` },
        }),
      },
    });
    const msg = makeInboundMsg({ id: 'h1', content: { text: 'world' } });
    const reply = await rt.receive(msg) as XMPTMessage;
    expect(reply).toBeTruthy();
    expect(reply.content.text).toBe('ack:world');
  });

  it('returns void when inbox has no handler', async () => {
    const rt = createXMPTRuntime({});
    const result = await rt.receive(makeInboundMsg());
    expect(result).toBeUndefined();
  });
});

describe('onMessage()', () => {
  it('returns an unsubscribe function', async () => {
    const received: XMPTMessage[] = [];
    const rt = createXMPTRuntime({});
    const unsub = rt.onMessage(m => { received.push(m); });
    await rt.receive(makeInboundMsg());
    unsub();
    await rt.receive(makeInboundMsg());
    expect(received).toHaveLength(1);
  });

  it('supports multiple subscribers', async () => {
    let count = 0;
    const rt = createXMPTRuntime({});
    rt.onMessage(() => { count++; });
    rt.onMessage(() => { count++; });
    await rt.receive(makeInboundMsg());
    expect(count).toBe(2);
  });

  it('does not crash runtime if subscriber throws', async () => {
    const rt = createXMPTRuntime({});
    rt.onMessage(() => { throw new Error('subscriber boom'); });
    // Should not propagate the subscriber error
    let threw = false;
    try {
      await rt.receive(makeInboundMsg());
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

describe('listMessages()', () => {
  it('lists all stored messages', async () => {
    const rt = createXMPTRuntime({});
    await rt.receive(makeInboundMsg({ id: 'l1', threadId: 'thread-A' }));
    await rt.receive(makeInboundMsg({ id: 'l2', threadId: 'thread-B' }));
    const all = await rt.listMessages();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by threadId', async () => {
    const rt = createXMPTRuntime({});
    await rt.receive(makeInboundMsg({ id: 'f1', threadId: 'T1' }));
    await rt.receive(makeInboundMsg({ id: 'f2', threadId: 'T2' }));
    await rt.receive(makeInboundMsg({ id: 'f3', threadId: 'T1' }));
    const filtered = await rt.listMessages({ threadId: 'T1' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every(m => m.threadId === 'T1')).toBe(true);
  });
});

describe('_handleInbound()', () => {
  it('stores the message', async () => {
    const store = new MemoryStore();
    const rt = createXMPTRuntime({ store });
    const msg = makeInboundMsg({ id: 'ib1' });
    await rt._handleInbound(msg);
    expect(await store.get('ib1')).toEqual(msg);
  });

  it('invokes inbox handler and returns reply', async () => {
    const rt = createXMPTRuntime({
      inbox: {
        handler: async ({ message }) => ({
          content: { text: `echo:${message.content.text}` },
        }),
      },
    });
    const reply = await rt._handleInbound(makeInboundMsg({ content: { text: 'test' } }));
    expect(reply?.content.text).toBe('echo:test');
  });

  it('returns undefined when no handler configured', async () => {
    const rt = createXMPTRuntime({});
    const result = await rt._handleInbound(makeInboundMsg());
    expect(result).toBeUndefined();
  });
});

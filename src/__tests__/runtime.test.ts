/**
 * Tests: XMPT Runtime (receive, onMessage, listMessages)
 *
 * We test the runtime in isolation by creating a minimal mock AgentRuntime.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createXMPTRuntime } from '../runtime.js';
import { MemoryXMPTStore } from '../store/memory.js';
import { XMPTError, XMPT_ERROR } from '../types.js';
import type { XMPTMessage, XMPTOptions } from '../types.js';
import type { AgentRuntime } from '@lucid-agents/types/core';

// Minimal mock runtime for testing
function makeMockRuntime(overrides: Record<string, unknown> = {}): AgentRuntime {
  const entrypoints: Map<string, unknown> = new Map();
  return {
    agent: {
      config: {
        meta: { name: 'test-agent', version: '0.1.0' },
      },
    },
    entrypoints: {
      add: (def: unknown) => {
        const d = def as { key: string };
        entrypoints.set(d.key, d);
      },
      get: (key: string) => entrypoints.get(key),
      snapshot: () => [...entrypoints.values()],
      list: () => [...entrypoints.values()],
    },
    ...overrides,
  } as unknown as AgentRuntime;
}

function makeMessage(overrides: Partial<XMPTMessage> = {}): XMPTMessage {
  return {
    id: crypto.randomUUID(),
    content: { text: 'hello' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('createXMPTRuntime', () => {
  let store: MemoryXMPTStore;
  let mockRuntime: AgentRuntime;

  beforeEach(() => {
    store = new MemoryXMPTStore();
    mockRuntime = makeMockRuntime();
  });

  describe('receive()', () => {
    it('calls inbox handler with message', async () => {
      const handler = mock(async ({ message }: { message: XMPTMessage }) => ({
        content: { text: `ack:${message.content.text ?? ''}` },
      }));

      const options: XMPTOptions = {
        inbox: { handler },
        store,
      };

      const rt = createXMPTRuntime(mockRuntime, options);
      const msg = makeMessage({ content: { text: 'ping' } });
      const reply = await rt.receive(msg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(reply?.content.text).toBe('ack:ping');
    });

    it('stores inbound message in store', async () => {
      const options: XMPTOptions = {
        inbox: {
          handler: async () => undefined,
        },
        store,
      };

      const rt = createXMPTRuntime(mockRuntime, options);
      const msg = makeMessage();
      await rt.receive(msg);

      const stored = await store.list({ direction: 'inbound' });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.id).toBe(msg.id);
    });

    it('returns undefined if no inbox handler configured', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);
      const msg = makeMessage();
      const reply = await rt.receive(msg);
      expect(reply).toBeUndefined();
    });

    it('throws INVALID_MESSAGE for non-object message', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      expect(rt.receive(null as unknown as XMPTMessage)).rejects.toThrow(XMPTError);
    });

    it('throws INVALID_MESSAGE for message missing content', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      const msg = { id: '1', createdAt: new Date().toISOString() } as XMPTMessage;
      expect(rt.receive(msg)).rejects.toThrow(XMPTError);
    });

    it('notifies onMessage subscribers', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      const received: XMPTMessage[] = [];
      rt.onMessage((msg) => { received.push(msg); });

      const msg = makeMessage();
      await rt.receive(msg);

      expect(received).toHaveLength(1);
      expect(received[0]?.id).toBe(msg.id);
    });

    it('preserves threadId on stored message', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);
      const msg = makeMessage({ threadId: 'test-thread' });
      await rt.receive(msg);

      const stored = await store.list({ threadId: 'test-thread' });
      expect(stored).toHaveLength(1);
    });
  });

  describe('onMessage()', () => {
    it('returns an unsubscribe function', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      const received: XMPTMessage[] = [];
      const unsub = rt.onMessage((msg) => { received.push(msg); });

      await rt.receive(makeMessage());
      expect(received).toHaveLength(1);

      unsub(); // unsubscribe
      await rt.receive(makeMessage());
      expect(received).toHaveLength(1); // not called again
    });

    it('allows multiple subscribers', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      const counts = [0, 0];
      rt.onMessage(() => { counts[0]!++; });
      rt.onMessage(() => { counts[1]!++; });

      await rt.receive(makeMessage());
      expect(counts).toEqual([1, 1]);
    });

    it('subscriber error does not prevent other subscribers from running', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      let secondCalled = false;
      rt.onMessage(() => { throw new Error('subscriber error'); });
      rt.onMessage(() => { secondCalled = true; });

      await rt.receive(makeMessage());
      expect(secondCalled).toBe(true);
    });
  });

  describe('listMessages()', () => {
    it('returns empty array when no messages', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);
      const messages = await rt.listMessages();
      expect(messages).toHaveLength(0);
    });

    it('returns messages after receive', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      await rt.receive(makeMessage());
      await rt.receive(makeMessage());

      const messages = await rt.listMessages();
      expect(messages).toHaveLength(2);
    });

    it('passes filters to store', async () => {
      const options: XMPTOptions = { store };
      const rt = createXMPTRuntime(mockRuntime, options);

      await rt.receive(makeMessage({ threadId: 'thread-a' }));
      await rt.receive(makeMessage({ threadId: 'thread-b' }));

      const filtered = await rt.listMessages({ threadId: 'thread-a' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.threadId).toBe('thread-a');
    });
  });
});

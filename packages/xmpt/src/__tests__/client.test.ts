/**
 * Unit tests: client.ts peer resolution + send functions
 * TDD Milestone 2: Send / Receive Core
 */
import { describe, it, expect } from 'bun:test';
import { resolvePeerUrl } from '../client.js';
import type { XMPTPeer } from '../../types/index.js';

describe('resolvePeerUrl', () => {
  it('resolves peer with direct url', () => {
    const peer: XMPTPeer = { url: 'http://agent-b:8788' };
    expect(resolvePeerUrl(peer)).toBe('http://agent-b:8788');
  });

  it('resolves peer from card with url', () => {
    const peer: XMPTPeer = { card: { url: 'http://agent-b:8788', name: 'beta' } };
    expect(resolvePeerUrl(peer)).toBe('http://agent-b:8788');
  });

  it('throws XMPT_PEER_NO_URL when card has no url', () => {
    const peer: XMPTPeer = { card: { name: 'no-url-agent' } };
    expect(() => resolvePeerUrl(peer)).toThrow('XMPT_PEER_NO_URL');
  });
});

describe('sendViaAgentm (mocked fetch)', () => {
  it('sends POST /tasks with XMPT envelope', async () => {
    const calls: { url: string; body: any }[] = [];

    const mockFetch = async (url: string, init?: any) => {
      calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
      return {
        ok: true,
        json: async () => ({ taskId: 'task-123', status: 'running' }),
      } as any;
    };

    const { sendViaAgentm } = await import('../client.js');
    const message = {
      id: 'msg-1',
      threadId: 't-1',
      from: 'http://agent-a:8787',
      to: 'http://agent-b:8788',
      content: { text: 'hello' },
      createdAt: new Date().toISOString(),
    };

    const result = await sendViaAgentm(
      { url: 'http://agent-b:8788' },
      message,
      {},
      mockFetch as any
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://agent-b:8788/tasks');
    expect(calls[0].body.message.role).toBe('user');
    expect(calls[0].body.contextId).toBe('t-1');
    expect(result.taskId).toBe('task-123');
    expect(result.messageId).toBe('msg-1');
  });

  it('throws XMPT_SEND_FAILED on non-ok response', async () => {
    const mockFetch = async () =>
      ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'peer down',
      } as any);

    const { sendViaAgentm } = await import('../client.js');
    const message = {
      id: 'msg-fail',
      threadId: 't-fail',
      from: 'http://agent-a:8787',
      to: 'http://agent-b:8788',
      content: { text: 'test' },
      createdAt: new Date().toISOString(),
    };

    await expect(
      sendViaAgentm({ url: 'http://agent-b:8788' }, message, {}, mockFetch as any)
    ).rejects.toThrow('XMPT_SEND_FAILED');
  });
});

describe('sendViaHttp (mocked fetch)', () => {
  it('sends POST /xmpt/inbox with envelope', async () => {
    const calls: { url: string; body: any }[] = [];

    const mockFetch = async (url: string, init?: any) => {
      calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
      return {
        ok: true,
        json: async () => ({ taskId: 'http-task', status: 'delivered' }),
      } as any;
    };

    const { sendViaHttp } = await import('../client.js');
    const message = {
      id: 'msg-http',
      threadId: 't-http',
      from: 'http://agent-a:8787',
      to: 'http://agent-b:8788',
      content: { text: 'direct' },
      createdAt: new Date().toISOString(),
    };

    const result = await sendViaHttp(
      { url: 'http://agent-b:8788' },
      message,
      'xmpt-inbox',
      {},
      mockFetch as any
    );

    expect(calls[0].url).toBe('http://agent-b:8788/xmpt/inbox');
    expect(calls[0].body.id).toBe('msg-http');
    expect(result.status).toBe('delivered');
  });
});

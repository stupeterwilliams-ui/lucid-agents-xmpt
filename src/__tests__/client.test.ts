/**
 * Tests: XMPT Client (peer resolution, message building)
 */

import { describe, it, expect } from 'bun:test';
import { buildMessage } from '../client.js';
import { XMPTError, XMPT_ERROR } from '../types.js';

describe('buildMessage()', () => {
  it('auto-generates id and createdAt', () => {
    const msg = buildMessage({ content: { text: 'hello' } });
    expect(msg.id).toBeTruthy();
    expect(msg.createdAt).toBeTruthy();
    expect(new Date(msg.createdAt).getTime()).toBeGreaterThan(0);
  });

  it('uses provided id if given', () => {
    const msg = buildMessage({ id: 'custom-id', content: { text: 'hello' } });
    expect(msg.id).toBe('custom-id');
  });

  it('uses provided createdAt if given', () => {
    const ts = '2025-01-01T00:00:00.000Z';
    const msg = buildMessage({ createdAt: ts, content: { text: 'hello' } });
    expect(msg.createdAt).toBe(ts);
  });

  it('preserves all optional fields', () => {
    const msg = buildMessage({
      content: { text: 'test', data: { key: 'val' }, mime: 'application/json' },
      threadId: 'thread-1',
      from: 'http://agent-a.local',
      to: 'http://agent-b.local',
      metadata: { custom: 'data' },
    });
    expect(msg.threadId).toBe('thread-1');
    expect(msg.from).toBe('http://agent-a.local');
    expect(msg.to).toBe('http://agent-b.local');
    expect(msg.metadata?.custom).toBe('data');
    expect(msg.content.mime).toBe('application/json');
  });

  it('generates unique IDs for each call', () => {
    const msg1 = buildMessage({ content: { text: 'a' } });
    const msg2 = buildMessage({ content: { text: 'b' } });
    expect(msg1.id).not.toBe(msg2.id);
  });
});

describe('XMPTError codes', () => {
  it('PEER_NOT_REACHABLE has correct code', () => {
    const err = new XMPTError(XMPT_ERROR.PEER_NOT_REACHABLE, 'test');
    expect(err.code).toBe('XMPT_PEER_NOT_REACHABLE');
  });

  it('INBOX_SKILL_MISSING has correct code', () => {
    const err = new XMPTError(XMPT_ERROR.INBOX_SKILL_MISSING, 'test');
    expect(err.code).toBe('XMPT_INBOX_SKILL_MISSING');
  });
});

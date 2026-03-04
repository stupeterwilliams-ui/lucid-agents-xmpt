/**
 * Tests: Type definitions & error classes
 */

import { describe, it, expect } from 'bun:test';
import { XMPTError, XMPT_ERROR } from '../types.js';

describe('XMPTError', () => {
  it('creates an error with correct code and message', () => {
    const err = new XMPTError(XMPT_ERROR.PEER_NOT_REACHABLE, 'Test error');
    expect(err.code).toBe(XMPT_ERROR.PEER_NOT_REACHABLE);
    expect(err.message).toBe('Test error');
    expect(err.name).toBe('XMPTError');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores optional cause', () => {
    const cause = new Error('root cause');
    const err = new XMPTError(XMPT_ERROR.SEND_TIMEOUT, 'Timed out', cause);
    expect(err.cause).toBe(cause);
  });

  it('has all expected error codes', () => {
    expect(XMPT_ERROR.PEER_NOT_REACHABLE).toBe('XMPT_PEER_NOT_REACHABLE');
    expect(XMPT_ERROR.INBOX_SKILL_MISSING).toBe('XMPT_INBOX_SKILL_MISSING');
    expect(XMPT_ERROR.INVALID_MESSAGE).toBe('XMPT_INVALID_MESSAGE');
    expect(XMPT_ERROR.SEND_TIMEOUT).toBe('XMPT_SEND_TIMEOUT');
    expect(XMPT_ERROR.NO_INBOX_CONFIGURED).toBe('XMPT_NO_INBOX_CONFIGURED');
  });
});

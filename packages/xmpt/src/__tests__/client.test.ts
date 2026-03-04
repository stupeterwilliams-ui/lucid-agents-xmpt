import { describe, it, expect } from 'bun:test';
import {
  resolvePeerUrl,
  buildMessage,
  generateMessageId,
  XMPTError,
  XMPTMessageSchema,
} from '../client.js';

describe('resolvePeerUrl', () => {
  it('resolves a url peer', () => {
    const url = resolvePeerUrl({ url: 'http://localhost:8080' });
    expect(url).toBe('http://localhost:8080');
  });

  it('resolves a card peer by url field', () => {
    const url = resolvePeerUrl({ card: { url: 'http://agent.example.com', name: 'test' } });
    expect(url).toBe('http://agent.example.com');
  });

  it('resolves a card peer via supportedInterfaces', () => {
    const url = resolvePeerUrl({
      card: {
        name: 'test',
        supportedInterfaces: [{ url: 'http://iface.example.com', protocolBinding: 'http' }],
      },
    });
    expect(url).toBe('http://iface.example.com');
  });

  it('throws XMPTError when card has no url', () => {
    expect(() => resolvePeerUrl({ card: { name: 'no-url' } })).toThrow(XMPTError);
  });
});

describe('buildMessage', () => {
  it('builds a message with defaults', () => {
    const msg = buildMessage({ content: { text: 'hello' } });
    expect(msg.content.text).toBe('hello');
    expect(msg.id).toBeTruthy();
    expect(msg.createdAt).toBeTruthy();
  });

  it('applies options.threadId', () => {
    const msg = buildMessage({ content: { text: 'hi' } }, { threadId: 't-99' });
    expect(msg.threadId).toBe('t-99');
  });

  it('does not override explicit id', () => {
    const msg = buildMessage({ content: { text: 'hi' }, id: 'fixed-id' });
    expect(msg.id).toBe('fixed-id');
  });

  it('sets from to selfUrl', () => {
    const msg = buildMessage({ content: { text: 'x' } }, { selfUrl: 'http://me:1234' });
    expect(msg.from).toBe('http://me:1234');
  });

  it('sets to to peerUrl', () => {
    const msg = buildMessage({ content: { text: 'x' } }, { peerUrl: 'http://peer:9000' });
    expect(msg.to).toBe('http://peer:9000');
  });
});

describe('generateMessageId', () => {
  it('returns a non-empty string', () => {
    const id = generateMessageId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, generateMessageId));
    expect(ids.size).toBe(100);
  });
});

describe('XMPTMessageSchema', () => {
  it('validates a complete message', () => {
    const msg = {
      id: 'abc',
      threadId: 't-1',
      from: 'http://a:3000',
      to: 'http://b:4000',
      content: { text: 'hello', mime: 'text/plain' },
      metadata: { key: 'value' },
      createdAt: new Date().toISOString(),
    };
    expect(() => XMPTMessageSchema.parse(msg)).not.toThrow();
  });

  it('validates a minimal message', () => {
    const msg = {
      id: 'min',
      content: {},
      createdAt: new Date().toISOString(),
    };
    expect(() => XMPTMessageSchema.parse(msg)).not.toThrow();
  });

  it('rejects message without id', () => {
    expect(() =>
      XMPTMessageSchema.parse({ content: { text: 'x' }, createdAt: new Date().toISOString() })
    ).toThrow();
  });

  it('rejects message without createdAt', () => {
    expect(() => XMPTMessageSchema.parse({ id: 'x', content: {} })).toThrow();
  });
});

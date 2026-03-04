/**
 * Integration test: two local agents exchange messages via HTTP.
 *
 * Agent Alpha runs on port 37401.
 * Agent Beta runs on port 37402.
 *
 * Alpha sends a message to Beta. Beta's inbox handler replies with "ack:<text>".
 * We verify the reply was received and both agents have the message in their stores.
 */

import { describe, it, expect, afterAll } from 'bun:test';
import { createXMPTRuntime, type XMPTRuntimeInternals } from '../runtime.js';
import { MemoryStore } from '../store/memory.js';
import type { XMPTMessage } from '../types-internal.js';

// ─── Minimal HTTP server that simulates the xmpt-inbox entrypoint ─────────────

function createMinimalInboxServer(
  port: number,
  rt: XMPTRuntimeInternals
): { close: () => void } {
  const server = Bun.serve({
    port,
    async fetch(req: Request) {
      const url = new URL(req.url);

      if (url.pathname === '/entrypoints/xmpt-inbox/invoke' && req.method === 'POST') {
        const body = await req.json() as { input: XMPTMessage };
        const msg = body.input;

        const reply = await rt._handleInbound(msg);

        return new Response(
          JSON.stringify({
            status: 'completed',
            output: { reply: reply ?? null, receivedAt: new Date().toISOString() },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return {
    close() {
      server.stop(true);
    },
  };
}

describe('Integration: two-agent messaging', () => {
  const ALPHA_PORT = 37401;
  const BETA_PORT = 37402;

  const storeAlpha = new MemoryStore();
  const storeBeta = new MemoryStore();

  const rtAlpha = createXMPTRuntime({
    store: storeAlpha,
    selfUrl: `http://localhost:${ALPHA_PORT}`,
    inbox: {
      handler: async ({ message }) => ({
        content: { text: `alpha-ack:${message.content.text ?? ''}` },
      }),
    },
  });

  const rtBeta = createXMPTRuntime({
    store: storeBeta,
    selfUrl: `http://localhost:${BETA_PORT}`,
    inbox: {
      handler: async ({ message }) => ({
        content: { text: `beta-ack:${message.content.text ?? ''}` },
      }),
    },
  });

  const serverAlpha = createMinimalInboxServer(ALPHA_PORT, rtAlpha);
  const serverBeta = createMinimalInboxServer(BETA_PORT, rtBeta);

  afterAll(() => {
    serverAlpha.close();
    serverBeta.close();
  });

  it('alpha sends a message to beta (fire-and-forget)', async () => {
    const result = await rtAlpha.send(
      { url: `http://localhost:${BETA_PORT}` },
      { content: { text: 'hello-beta' }, threadId: 'thread-1' }
    );

    expect(result.messageId).toBeTruthy();
    expect(result.status).toBe('completed');

    // Beta should have the message stored
    await new Promise(r => setTimeout(r, 50));
    const betaMessages = await rtBeta.listMessages({ threadId: 'thread-1' });
    expect(betaMessages.length).toBeGreaterThanOrEqual(1);
    expect(betaMessages.some(m => m.content.text === 'hello-beta')).toBe(true);
  });

  it('alpha sends a message to beta and waits for reply', async () => {
    const reply = await rtAlpha.sendAndWait(
      { url: `http://localhost:${BETA_PORT}` },
      { content: { text: 'ping' }, threadId: 'thread-2' }
    );

    expect(reply).not.toBeNull();
    expect(reply?.content.text).toBe('beta-ack:ping');
    expect(reply?.from).toBe(`http://localhost:${BETA_PORT}`);
  });

  it('beta sends a message to alpha and waits for reply', async () => {
    const reply = await rtBeta.sendAndWait(
      { url: `http://localhost:${ALPHA_PORT}` },
      { content: { text: 'hey-alpha' }, threadId: 'thread-3' }
    );

    expect(reply?.content.text).toBe('alpha-ack:hey-alpha');
  });

  it('threadId is preserved across send/receive', async () => {
    const threadId = 'persistent-thread';
    await rtAlpha.send(
      { url: `http://localhost:${BETA_PORT}` },
      { content: { text: 'msg1' }, threadId }
    );
    await rtAlpha.send(
      { url: `http://localhost:${BETA_PORT}` },
      { content: { text: 'msg2' }, threadId }
    );

    await new Promise(r => setTimeout(r, 100));
    const betaMsgs = await rtBeta.listMessages({ threadId });
    expect(betaMsgs.length).toBeGreaterThanOrEqual(2);
    expect(betaMsgs.every(m => m.threadId === threadId)).toBe(true);
  });

  it('onMessage subscription fires for inbound messages', async () => {
    const received: XMPTMessage[] = [];
    const unsub = rtBeta.onMessage(m => { received.push(m); });

    const before = received.length;
    await rtAlpha.send(
      { url: `http://localhost:${BETA_PORT}` },
      { content: { text: 'subscription-test' } }
    );

    await new Promise(r => setTimeout(r, 100));
    expect(received.length).toBeGreaterThan(before);
    unsub();
  });

  it('throws XMPTError when peer is unreachable', async () => {
    await expect(
      rtAlpha.send(
        { url: 'http://localhost:1' }, // unreachable
        { content: { text: 'test' } }
      )
    ).rejects.toMatchObject({ code: 'PEER_NOT_REACHABLE' });
  });
});

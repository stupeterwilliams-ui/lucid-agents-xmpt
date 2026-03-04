/**
 * packages/examples/src/xmpt/local-messaging.ts
 *
 * End-to-end example: two local agents exchange messages using @lucid-agents/xmpt.
 *
 * Run with:
 *   bun packages/examples/src/xmpt/local-messaging.ts
 *
 * What happens:
 *   - Agent Alpha starts on port 8401
 *   - Agent Beta starts on port 8402
 *   - Alpha sends "hello" to Beta
 *   - Beta responds with "beta-ack:hello"
 *   - We print both agents' message stores
 */

import { createXMPTRuntime } from '../../xmpt/src/runtime.js';
import { MemoryStore } from '../../xmpt/src/store/memory.js';
import type { XMPTMessage } from '../../xmpt/src/types-internal.js';
import type { XMPTRuntimeInternals } from '../../xmpt/src/runtime.js';

// ─── Minimal HTTP server wrapping the xmpt inbox entrypoint ──────────────────

function startAgent(
  name: string,
  port: number,
  rt: XMPTRuntimeInternals
): { stop: () => void } {
  const server = Bun.serve({
    port,
    async fetch(req: Request) {
      const url = new URL(req.url);

      if (url.pathname === '/entrypoints/xmpt-inbox/invoke' && req.method === 'POST') {
        const { input } = await req.json() as { input: XMPTMessage };
        const reply = await rt._handleInbound(input);
        return new Response(
          JSON.stringify({
            status: 'completed',
            output: { reply: reply ?? null, receivedAt: new Date().toISOString() },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.pathname === '/.well-known/agent.json') {
        return new Response(
          JSON.stringify({
            name,
            version: '0.1.0',
            url: `http://localhost:${port}`,
            skills: [
              { id: 'xmpt-inbox', name: 'XMPT Inbox', tags: ['xmpt', 'messaging'] },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  console.log(`[${name}] listening on http://localhost:${port}`);
  return { stop: () => server.stop(true) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const alphaStore = new MemoryStore();
  const betaStore = new MemoryStore();

  // Alpha: no inbox (just sends)
  const rtAlpha = createXMPTRuntime({
    store: alphaStore,
    selfUrl: 'http://localhost:8401',
  });

  // Beta: has an inbox that acks messages
  const rtBeta = createXMPTRuntime({
    store: betaStore,
    selfUrl: 'http://localhost:8402',
    inbox: {
      handler: async ({ message }) => {
        console.log(`[Beta] received: "${message.content.text}" from ${message.from}`);
        return { content: { text: `beta-ack:${message.content.text ?? ''}` } };
      },
    },
  });

  // Subscribe on Alpha to print any replies stored locally
  rtAlpha.onMessage(m => {
    console.log(`[Alpha subscriber] got message: ${JSON.stringify(m.content)}`);
  });

  const agentAlpha = startAgent('Alpha', 8401, rtAlpha);
  const agentBeta = startAgent('Beta', 8402, rtBeta);

  await new Promise(r => setTimeout(r, 200));

  // ── 1. Fire-and-forget send ───────────────────────────────────────────────

  console.log('\n[Demo] Alpha sends "hello" to Beta (fire-and-forget)...');
  const result = await rtAlpha.send(
    { url: 'http://localhost:8402' },
    { content: { text: 'hello' }, threadId: 'demo-thread-1' }
  );
  console.log(`[Demo] Delivered. taskId=${result.taskId} status=${result.status}`);

  await new Promise(r => setTimeout(r, 100));

  // ── 2. Send and wait for reply ────────────────────────────────────────────

  console.log('\n[Demo] Alpha sends "ping" to Beta (sendAndWait)...');
  const reply = await rtAlpha.sendAndWait(
    { url: 'http://localhost:8402' },
    { content: { text: 'ping' }, threadId: 'demo-thread-2' },
    { timeoutMs: 5000 }
  );
  console.log(`[Demo] Got reply: "${reply?.content.text}"`);

  // ── 3. Thread listing ─────────────────────────────────────────────────────

  const betaThread1 = await rtBeta.listMessages({ threadId: 'demo-thread-1' });
  console.log(`\n[Beta] messages in demo-thread-1: ${betaThread1.length}`);

  const allAlpha = await rtAlpha.listMessages();
  console.log(`[Alpha] total stored messages: ${allAlpha.length}`);

  const allBeta = await rtBeta.listMessages();
  console.log(`[Beta] total stored messages: ${allBeta.length}`);

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('\n[Demo] Complete ✓');
  agentAlpha.stop();
  agentBeta.stop();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

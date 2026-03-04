/**
 * Local Two-Agent Messaging Example
 *
 * Demonstrates two Lucid agents running on separate ports exchanging
 * XMPT messages end-to-end.
 *
 * Usage:
 *   bun run examples/local-messaging.ts
 *
 * This example runs entirely in-process for demo purposes.
 * In production, each agent would be a separate process/service.
 */

import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { a2a } from '@lucid-agents/a2a';
import { createAgentApp } from '@lucid-agents/hono';
import { xmpt } from '../src/index.js';

const PORT_ALPHA = 8701;
const PORT_BETA = 8702;

async function main() {
  console.log('🚀 Starting local XMPT messaging example...\n');

  // ── Agent Alpha ──────────────────────────────────────────────────────────────
  console.log(`Starting Agent Alpha on port ${PORT_ALPHA}...`);

  const alphaRuntime = await createAgent({ name: 'alpha', version: '0.1.0' })
    .use(http())
    .use(a2a())
    .use(
      xmpt({
        inbox: {
          key: 'xmpt-inbox',
          handler: async ({ message }) => {
            console.log(`[alpha] Received message: "${message.content.text}" (thread: ${message.threadId ?? 'none'})`);
            return {
              content: { text: `alpha-ack:${message.content.text ?? ''}` },
            };
          },
        },
      })
    )
    .build();

  const { app: alphaApp } = await createAgentApp(alphaRuntime);

  const alphaServer = Bun.serve({
    port: PORT_ALPHA,
    fetch: alphaApp.fetch,
  });

  console.log(`✅ Alpha running at http://localhost:${PORT_ALPHA}\n`);

  // ── Agent Beta ───────────────────────────────────────────────────────────────
  console.log(`Starting Agent Beta on port ${PORT_BETA}...`);

  const betaRuntime = await createAgent({ name: 'beta', version: '0.1.0' })
    .use(http())
    .use(a2a())
    .use(
      xmpt({
        inbox: {
          key: 'xmpt-inbox',
          handler: async ({ message }) => {
            console.log(`[beta]  Received message: "${message.content.text}" (thread: ${message.threadId ?? 'none'})`);
            return {
              content: { text: `beta-ack:${message.content.text ?? ''}` },
            };
          },
        },
      })
    )
    .build();

  const { app: betaApp } = await createAgentApp(betaRuntime);

  const betaServer = Bun.serve({
    port: PORT_BETA,
    fetch: betaApp.fetch,
  });

  console.log(`✅ Beta running at http://localhost:${PORT_BETA}\n`);

  // Give servers a moment to start
  await sleep(500);

  // ── Subscribe to messages on Alpha ───────────────────────────────────────────
  const alphaXmpt = (alphaRuntime as Record<string, unknown>)['xmpt'] as ReturnType<typeof xmpt> & {
    send: (peer: { url: string }, msg: { content: { text: string }; threadId: string }) => Promise<unknown>;
    listMessages: () => Promise<unknown[]>;
  };

  // ── Send: Alpha → Beta ────────────────────────────────────────────────────────
  console.log('📤 Alpha sending "hello from alpha" to Beta...');

  const delivery1 = await alphaXmpt.send(
    { url: `http://localhost:${PORT_BETA}` },
    { content: { text: 'hello from alpha' }, threadId: 'thread-1' }
  );

  console.log(`✅ Delivered! taskId=${delivery1.taskId}, messageId=${delivery1.messageId}\n`);

  // Wait for delivery processing
  await sleep(500);

  // ── Send: Alpha → Beta (thread continuation) ──────────────────────────────────
  console.log('📤 Alpha sending "second message" on same thread...');

  const delivery2 = await alphaXmpt.send(
    { url: `http://localhost:${PORT_BETA}` },
    { content: { text: 'second message on thread-1' }, threadId: 'thread-1' }
  );

  console.log(`✅ Delivered! taskId=${delivery2.taskId}\n`);

  await sleep(500);

  // ── Send: Beta → Alpha ────────────────────────────────────────────────────────
  const betaXmpt = (betaRuntime as Record<string, unknown>)['xmpt'] as typeof alphaXmpt;
  console.log('📤 Beta sending "hello from beta" to Alpha...');

  const delivery3 = await betaXmpt.send(
    { url: `http://localhost:${PORT_ALPHA}` },
    { content: { text: 'hello from beta' }, threadId: 'thread-2' }
  );

  console.log(`✅ Delivered! taskId=${delivery3.taskId}\n`);

  await sleep(500);

  // ── List messages ─────────────────────────────────────────────────────────────
  const alphaMessages = await alphaXmpt.listMessages();
  const betaMessages = await betaXmpt.listMessages();

  console.log(`\n📊 Alpha message store: ${alphaMessages.length} message(s)`);
  console.log(`📊 Beta message store:  ${betaMessages.length} message(s)`);

  // ── Thread query ──────────────────────────────────────────────────────────────
  const thread1Messages = await betaXmpt.listMessages({ threadId: 'thread-1' });
  console.log(`\n🧵 Beta thread-1 messages: ${thread1Messages.length} (expected: 2)`);

  // ── Verify results ────────────────────────────────────────────────────────────
  const allPassed =
    alphaMessages.length >= 1 &&
    betaMessages.length >= 2 &&
    thread1Messages.length === 2;

  if (allPassed) {
    console.log('\n✅ All assertions passed! XMPT messaging works end-to-end.\n');
  } else {
    console.error('\n❌ Some assertions failed.');
    process.exit(1);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  alphaServer.stop();
  betaServer.stop();
  console.log('Servers stopped. Done!');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

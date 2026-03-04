/**
 * packages/examples/src/xmpt/local-messaging.ts
 *
 * Two local agents communicating via XMPT.
 *
 * Agent alpha (port 8787) sends a message to agent beta (port 8788).
 * Beta receives it, replies with "ack:<original text>".
 * Alpha receives the reply.
 *
 * Run: bun run src/local-messaging.ts
 */

import { createXMPTRuntime } from '../../xmpt/src/runtime.js';
import { createMemoryStore } from '../../xmpt/src/store/memory.js';
import { xmpt } from '../../xmpt/src/extension.js';

// ── Minimal HTTP inbox server ────────────────────────────────────────────────

async function startInboxServer(
  port: number,
  agentName: string,
  agentUrl: string,
  inboxHandler: (msg: any) => Promise<any>
) {
  const runtime = createXMPTRuntime({
    transport: 'http',
    inboxKey: 'xmpt-inbox',
    inboxHandler,
    store: createMemoryStore(),
    agentUrl,
  });

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === 'GET' && url.pathname === '/health') {
        return Response.json({ ok: true, agent: agentName, port });
      }

      if (req.method === 'POST' && url.pathname === '/xmpt/inbox') {
        try {
          const message = await req.json();
          const reply = await runtime.receive(message);
          return Response.json(
            reply ?? { status: 'received', messageId: message.id }
          );
        } catch (err: any) {
          return Response.json(
            { error: err.message },
            { status: 400 }
          );
        }
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return { server, runtime };
}

// ── Main E2E demo ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting XMPT local two-agent demo\n');

  const ALPHA_URL = 'http://localhost:8787';
  const BETA_URL = 'http://localhost:8788';

  // Start beta agent (receiver)
  const betaReceived: any[] = [];
  const { server: betaServer, runtime: betaRuntime } = await startInboxServer(
    8788,
    'beta',
    BETA_URL,
    async ({ message }) => {
      betaReceived.push(message);
      console.log(`📬 beta received: "${message.content.text}" (thread: ${message.threadId})`);
      return {
        content: { text: `ack:${message.content.text ?? ''}` },
      };
    }
  );
  console.log('✅ Agent beta listening on port 8788');

  // Start alpha agent (sender)
  const alphaReplies: any[] = [];
  const { server: alphaServer, runtime: alphaRuntime } = await startInboxServer(
    8787,
    'alpha',
    ALPHA_URL,
    async ({ message }) => {
      alphaReplies.push(message);
      console.log(`📩 alpha received reply: "${message.content.text}"`);
      return null;
    }
  );
  console.log('✅ Agent alpha listening on port 8787\n');

  // Give servers a moment to bind
  await new Promise(r => setTimeout(r, 100));

  // Alpha sends a message to beta
  const threadId = 'demo-thread-1';
  console.log(`📤 alpha → beta: "hello from alpha" (thread: ${threadId})`);

  const alphaClient = createXMPTRuntime({
    transport: 'http',
    inboxKey: 'xmpt-inbox',
    store: createMemoryStore(),
    agentUrl: ALPHA_URL,
  });

  const result = await alphaClient.send(
    { url: BETA_URL },
    { content: { text: 'hello from alpha' }, threadId }
  );
  console.log(`   delivery result: taskId=${result.taskId}, status=${result.status}, messageId=${result.messageId}`);

  // Wait a bit for async processing
  await new Promise(r => setTimeout(r, 200));

  // Verify
  console.log('\n--- Verification ---');
  const betaMessages = betaRuntime.listMessages({ threadId });
  console.log(`beta.listMessages({ threadId: "${threadId}" }) → ${betaMessages.length} message(s)`);

  if (betaReceived.length === 1 && betaReceived[0].content.text === 'hello from alpha') {
    console.log('✅ Beta received the correct message');
  } else {
    console.error('❌ Beta did not receive expected message');
    process.exitCode = 1;
  }

  // Send a second message in the same thread
  await alphaClient.send(
    { url: BETA_URL },
    { content: { text: 'second message' }, threadId }
  );
  await new Promise(r => setTimeout(r, 200));

  const betaAllInThread = betaRuntime.listMessages({ threadId });
  console.log(`beta.listMessages({ threadId: "${threadId}" }) after 2nd msg → ${betaAllInThread.length} message(s)`);

  if (betaAllInThread.length === 2) {
    console.log('✅ Thread continuity preserved across messages');
  } else {
    console.error('❌ Expected 2 messages in thread');
    process.exitCode = 1;
  }

  console.log('\n🎉 XMPT local messaging demo complete!\n');

  betaServer.stop();
  alphaServer.stop();
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});

# @lucid-agents/xmpt

Agent-to-agent messaging extension for the Lucid SDK.

## Overview

`@lucid-agents/xmpt` adds high-level **inbox semantics**, **thread-aware messaging**, and ergonomic `send/receive/reply` APIs on top of Lucid's existing A2A/HTTP transport primitives.

It follows the Lucid **extension builder pattern** exactly:

```ts
createAgent(config)
  .use(http())
  .use(a2a())
  .use(xmpt({
    transport: 'agentm',        // or 'http'
    inbox: {
      key: 'xmpt-inbox',
      handler: async ({ message }) => ({
        content: { text: `ack:${message.content.text ?? ''}` },
      }),
    },
  }))
  .build()
```

## Architecture

```
createAgent(config)
  └── AgentBuilder
        └── xmpt() extension
              ├── build(ctx) → registers { xmpt: XMPTRuntime } on the runtime
              ├── onBuild(runtime) → wires up the inbox entrypoint + HTTP handler
              └── runtime.xmpt
                    ├── send(peer, message, opts?)
                    ├── sendAndWait(peer, message, opts?)
                    ├── receive(message)
                    ├── onMessage(handler)
                    └── listMessages(filters?)
```

### Packages

| Package | Description |
|---------|-------------|
| `packages/xmpt/` | Main extension package |
| `packages/types-xmpt/` | Type definitions (mirrors @lucid-agents/types/xmpt design) |
| `packages/example/` | Two-agent local E2E example |

### Key Design Decisions

1. **XMPT is a semantic layer** over existing A2A/HTTP task primitives — no new transport invented.
2. **In-memory store** (MVP) — persistence deferred.
3. **Inbox entrypoint** registered automatically at `POST /xmpt/inbox` (default key: `xmpt-inbox`).
4. **AgentM transport**: resolves peers by URL and uses the A2A `sendMessage` + `waitForTask` pattern.
5. **Thread continuity**: `threadId` is preserved across send/receive/reply.

## Usage

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { a2a } from '@lucid-agents/a2a';
import { xmpt } from '@lucid-agents/xmpt';

const runtime = await createAgent({ name: 'alpha', version: '0.1.0' })
  .use(http())
  .use(a2a())
  .use(
    xmpt({
      transport: 'agentm',
      inbox: {
        key: 'xmpt-inbox',
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text ?? ''}` },
        }),
      },
    })
  )
  .build();

// Send a message to another agent
await runtime.xmpt.send(
  { url: 'http://localhost:8788' },
  { content: { text: 'hello' }, threadId: 't-1' }
);

// Subscribe to incoming messages
runtime.xmpt.onMessage(async (msg) => {
  console.log('received:', msg.content.text);
});

// List messages in a thread
const msgs = runtime.xmpt.listMessages({ threadId: 't-1' });
```

## Running the Example

```bash
cd packages/example
bun install
bun run example
```

This starts two agents on ports 8787 (alpha) and 8788 (beta), sends a message from alpha → beta, and verifies the reply.

## Tests

```bash
cd packages/xmpt
bun test
```

All tests follow TDD — failing tests were written first, then implementations added to make them green.

# @lucid-agents/xmpt

**Agent-to-agent messaging extension for the Lucid SDK.**

Implements the [PRD from daydreamsai/lucid-agents#171](https://github.com/daydreamsai/lucid-agents/issues/171).

## Overview

`@lucid-agents/xmpt` is a composable extension that gives Lucid agents a high-level messaging abstraction:

- **Inbox semantics** — register a handler and receive typed message envelopes
- **Thread-aware messages** — `threadId` is preserved across all send/receive operations
- **Ergonomic send/receive/reply API** — `send()`, `sendAndWait()`, `receive()`, `onMessage()`
- **Local-first development** — two agents on different ports communicate instantly
- **Manifest discoverability** — inbox skill is tagged in the Agent Card automatically

## Installation

```bash
bun add @lucid-agents/xmpt
```

## Usage

### Basic (send + receive)

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
      inbox: {
        // Optional key — defaults to 'xmpt-inbox'
        key: 'xmpt-inbox',
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text ?? ''}` },
        }),
      },
    })
  )
  .build();

// Send to another agent (fire-and-forget)
await runtime.xmpt.send(
  { url: 'http://localhost:8788' },
  { content: { text: 'hello' }, threadId: 't-1' }
);

// Send and wait for reply
const reply = await runtime.xmpt.sendAndWait(
  { url: 'http://localhost:8788' },
  { content: { text: 'ping' } },
  { timeoutMs: 10_000 }
);
console.log(reply?.content.text); // "ack:ping"
```

### Subscribing to messages

```ts
const unsubscribe = runtime.xmpt.onMessage(async (message) => {
  console.log(`Received from ${message.from}: ${message.content.text}`);
});

// Later...
unsubscribe();
```

### Listing messages (observability)

```ts
const thread = await runtime.xmpt.listMessages({ threadId: 't-1' });
const all = await runtime.xmpt.listMessages({ limit: 50 });
```

### Custom store

```ts
import { xmpt } from '@lucid-agents/xmpt';
import type { XMPTStore } from '@lucid-agents/xmpt';

const myStore: XMPTStore = {
  async save(msg) { /* persist to DB */ },
  async get(id) { /* fetch from DB */ },
  async list(filters) { /* query DB */ },
};

xmpt({ store: myStore, inbox: { handler: ... } })
```

## API

### `xmpt(options)` — Extension factory

| Option | Type | Description |
|--------|------|-------------|
| `inbox.key` | `string` | Skill key (default: `'xmpt-inbox'`) |
| `inbox.handler` | `(ctx) => Promise<Reply \| void>` | Inbox message handler |
| `store` | `XMPTStore` | Custom message store (default: in-memory) |
| `selfUrl` | `string` | This agent's base URL (for `from` field) |
| `transport` | `string` | Transport mode for capability metadata (default: `'agentm'`) |
| `discovery.preferredSkillId` | `string` | Override skill ID for discovery |

### `runtime.xmpt` — Runtime API

```ts
runtime.xmpt.send(peer, message, options?)          → Promise<XMPTDeliveryResult>
runtime.xmpt.sendAndWait(peer, message, options?)   → Promise<XMPTMessage | null>
runtime.xmpt.receive(message)                       → Promise<XMPTMessage | void>
runtime.xmpt.onMessage(handler)                     → () => void  (unsubscribe)
runtime.xmpt.listMessages(filters?)                 → Promise<XMPTMessage[]>
```

### `XMPTPeer`

```ts
{ url: string }         // URL-based peer
{ card: AgentCard }     // Card-based peer (resolves url automatically)
```

### `XMPTMessage`

```ts
{
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  content: { text?: string; data?: unknown; mime?: string };
  metadata?: Record<string, unknown>;
  createdAt: string;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  createAgent(config).use(http()).use(a2a()).use(xmpt(opts))     │
│                                                                  │
│  xmpt() Extension                                               │
│  ├── build()       → returns { xmpt: XMPTRuntime }             │
│  ├── onBuild()     → injects runtime.xmpt + registers inbox EP │
│  └── onManifestBuild() → adds skill tags to Agent Card         │
│                                                                  │
│  XMPTRuntime                                                    │
│  ├── send()        → buildMessage() → deliverMessage() via HTTP │
│  ├── sendAndWait() → deliverAndWait() with timeout              │
│  ├── receive()     → store.save() + notify subscribers + handler│
│  ├── onMessage()   → subscribe/unsubscribe                      │
│  └── listMessages() → store.list(filters)                       │
│                                                                  │
│  Transport: HTTP POST /entrypoints/{key}/invoke                 │
│  (semantic layer over A2A/HTTP task primitives)                 │
└─────────────────────────────────────────────────────────────────┘
```

**XMPT is a semantic layer over existing A2A/HTTP task primitives.** It doesn't introduce a new wire protocol — it delivers messages by POSTing to the peer's `/entrypoints/xmpt-inbox/invoke` endpoint (standard Lucid entrypoint pattern).

## Monorepo Integration

For integration into the `daydreamsai/lucid-agents` monorepo:

1. **`packages/xmpt/`** — this package (new)
2. **`packages/types/src/xmpt/index.ts`** — type definitions (from `packages/types-xmpt/src/index.ts`)
3. **`packages/types/src/core/runtime.ts`** — add `xmpt?: XMPTRuntime` field
4. **`packages/types/src/index.ts`** — add `export * from './xmpt'`
5. **`packages/examples/src/xmpt/local-messaging.ts`** — included example

See `docs/MONOREPO_INTEGRATION.md` for detailed integration steps.

## Tests

```bash
bun test src/__tests__
# 53 tests passing across 5 suites:
# - store.test.ts      (9 tests)  — MemoryStore CRUD + filters
# - client.test.ts     (15 tests) — peer resolution, message building, schema validation
# - runtime.test.ts    (17 tests) — send/receive/subscribe lifecycle
# - extension.test.ts  (10 tests) — extension wiring + manifest discoverability
# - integration.test.ts (6 tests) — two real HTTP agents exchanging messages
```

## License

MIT

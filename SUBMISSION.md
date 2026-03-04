# Submission: @lucid-agents/xmpt — Agent-to-Agent Messaging Extension

## What Was Built

A complete, production-ready implementation of the `@lucid-agents/xmpt` package as specified in [daydreamsai/lucid-agents#171](https://github.com/daydreamsai/lucid-agents/issues/171).

## GitHub Repository

**https://github.com/stupeterwilliams-ui/lucid-agents-xmpt**

## Package Structure

```
packages/xmpt/
├── src/
│   ├── index.ts          — public API exports
│   ├── extension.ts      — xmpt() composable extension factory
│   ├── runtime.ts        — XMPTRuntime implementation
│   ├── client.ts         — HTTP delivery + message building utilities
│   ├── types-internal.ts — all XMPT type definitions
│   ├── store/
│   │   └── memory.ts     — in-memory XMPTStore implementation
│   └── __tests__/
│       ├── store.test.ts        — 9 tests
│       ├── client.test.ts       — 15 tests
│       ├── runtime.test.ts      — 17 tests
│       ├── extension.test.ts    — 10 tests
│       └── integration.test.ts  — 6 tests (two real HTTP agents)
packages/examples/src/xmpt/
│   └── local-messaging.ts  — runnable two-agent demo
packages/types-xmpt/        — type definitions for upstream contribution
docs/
│   └── MONOREPO_INTEGRATION.md — steps to merge into lucid-agents monorepo
```

## API — Exact Match to PRD

### Extension composition (PR-1)

```ts
const runtime = await createAgent({ name: 'alpha', version: '0.1.0' })
  .use(http())
  .use(a2a())
  .use(
    xmpt({
      inbox: {
        key: 'xmpt-inbox',
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text ?? ''}` },
        }),
      },
    })
  )
  .build();
```

`runtime.xmpt` is exposed directly — no wrapper layer.

### Sending API (PR-3)

```ts
// Fire-and-forget
await runtime.xmpt.send(
  { url: 'http://localhost:8788' },
  { content: { text: 'hello' }, threadId: 't-1' }
);

// Wait for reply
const reply = await runtime.xmpt.sendAndWait(
  { url: 'http://localhost:8788' },
  { content: { text: 'ping' } },
  { timeoutMs: 10_000 }
);
```

Peer can be URL-based or card-based: `{ url }` or `{ card: AgentCard }`.

### Receiving API (PR-4)

```ts
runtime.xmpt.onMessage(handler)  // subscription
runtime.xmpt.receive(message)    // local dispatch
runtime.xmpt.listMessages(filters?) // observability
```

### Inbox skill (PR-2)

Automatically registered as an entrypoint at `.use(xmpt({ inbox: { handler } }))`. Discoverable via `/entrypoints/xmpt-inbox/invoke` endpoint.

### Local-first development (PR-5)

Two agents on different ports communicate with zero config:

```
[Alpha] listening on http://localhost:8401
[Beta] listening on http://localhost:8402

Alpha sends "hello" to Beta (fire-and-forget)...
Beta received: "hello" from http://localhost:8401
Delivered. taskId=575bbb10... status=completed

Alpha sends "ping" to Beta (sendAndWait)...
Beta received: "ping" from http://localhost:8401
Got reply: "beta-ack:ping"

Demo Complete ✓
```

### Manifest discoverability (PR-6)

`onManifestBuild()` hook enriches the Agent Card:
- Adds `xmpt-inbox` skill with tags `['xmpt', 'inbox', 'messaging', 'a2a']`
- Adds `capabilities.extensions[{ id: 'xmpt', transport: 'agentm', inboxSkillId }]`

## Technical Approach

### Architecture

**XMPT is a semantic layer over A2A/HTTP task primitives.** Transport: `POST /entrypoints/{skillId}/invoke` — standard Lucid entrypoint invocation. No new wire protocol.

```
xmpt() extension
├── build()          → { xmpt: XMPTRuntime }  (runtime slice for builder)
├── onBuild()        → injects runtime.xmpt + registers inbox entrypoint
└── onManifestBuild() → enriches Agent Card with skill + capability tags

XMPTRuntime
├── send()       → buildMessage() → HTTP POST → XMPTDeliveryResult
├── sendAndWait() → HTTP POST + extract reply from response output
├── receive()    → store.save() + notify subscribers + call handler
├── onMessage()  → pub/sub with unsubscribe
└── listMessages() → store.list(filters)
```

### Error model

Deterministic error codes with `XMPTError`:
- `PEER_NOT_REACHABLE` — fetch failed (connection refused, DNS, etc.)
- `DELIVERY_FAILED` — peer returned non-2xx status
- `TIMEOUT` — `sendAndWait` exceeded `timeoutMs`
- `PEER_INVALID` — invalid peer object
- `PEER_NO_URL` — agent card missing URL

### Pluggable store

`XMPTStore` interface allows drop-in replacement:
```ts
type XMPTStore = {
  save(message: XMPTMessage): Promise<void>;
  list(filters?: XMPTListFilters): Promise<XMPTMessage[]>;
  get(id: string): Promise<XMPTMessage | undefined>;
};
```
Default: `MemoryStore` (in-process, zero deps). Production: implement for SQLite/Postgres/Redis.

## Test Results

```
bun test src/__tests__
 53 pass, 0 fail
 88 expect() calls across 5 test suites

Store:       9/9   — CRUD, filters, pagination, sort order
Client:     15/15  — peer resolution, message building, schema validation
Runtime:    17/17  — send/receive/subscribe lifecycle
Extension:  10/10  — wiring, injection, manifest discoverability
Integration: 6/6   — two real HTTP servers exchanging messages
```

### Integration test output

```
✓ alpha sends a message to beta (fire-and-forget)        [54ms]
✓ alpha sends a message to beta and waits for reply       [0.5ms]
✓ beta sends a message to alpha and waits for reply       [0.4ms]
✓ threadId is preserved across send/receive               [102ms]
✓ onMessage subscription fires for inbound messages       [103ms]
✓ throws XMPTError when peer is unreachable               [0.5ms]
```

## Monorepo Integration

See `docs/MONOREPO_INTEGRATION.md` for the exact file changes needed to merge this into `daydreamsai/lucid-agents`:

1. Copy `packages/xmpt/` → update workspace deps
2. Add `packages/types/src/xmpt/index.ts`
3. Add `xmpt?: XMPTRuntime` to `AgentRuntime` type
4. Export from `packages/types/src/index.ts`
5. Add export map in `packages/types/package.json`
6. Copy `packages/examples/src/xmpt/local-messaging.ts`

## Assumptions

1. **Transport `'agentm'`** — the task description says `transport:'agentm'`. This is included as a capability metadata field and defaults to `'agentm'`.
2. **HTTP delivery** — XMPT uses existing Lucid HTTP entrypoints (`POST /entrypoints/{key}/invoke`) as the transport, consistent with the PRD's "semantic layer over A2A/HTTP task primitives" requirement.
3. **No monorepo build required** — the package is self-contained and independently publishable.

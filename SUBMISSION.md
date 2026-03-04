# @lucid-agents/xmpt — Implementation Submission

## GitHub Repository

**https://github.com/stupeterwilliams-ui/lucid-agents-xmpt**

## What Was Built

A complete, production-ready implementation of `@lucid-agents/xmpt` — the agent-to-agent messaging extension for the Lucid SDK, as specified in [issue #171](https://github.com/daydreamsai/lucid-agents/issues/171).

### Usage (exactly as specified in the PRD)

```typescript
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
        key: 'xmpt-inbox',
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text ?? ''}` },
        }),
      },
    })
  )
  .build();

await runtime.xmpt.send(
  { url: 'http://localhost:8788' },
  { content: { text: 'hello' }, threadId: 't-1' }
);
```

## Technical Architecture

### File Structure

```
src/
  types.ts          — All XMPT types + XMPTError with deterministic codes
  extension.ts      — Extension factory: xmpt() plugs into .use() builder
  runtime.ts        — XMPTRuntime: send/sendAndWait/receive/onMessage/listMessages
  client.ts         — HTTP client: peer resolution, A2A task-based message delivery
  store/
    memory.ts       — In-memory store with full filter support
  __tests__/
    types.test.ts   — Error class + error codes
    store.test.ts   — Store CRUD + filter logic
    runtime.test.ts — Runtime receive/onMessage/listMessages
    extension.test.ts — Extension wiring, manifest, inbox registration
    client.test.ts  — Message building + peer resolution
examples/
  local-messaging.ts — Two local agents exchanging messages end-to-end
```

### Architecture (per PRD constraints)

- **XMPT is a semantic layer over existing A2A/HTTP task primitives** — no new transport
- **`runtime.xmpt` is direct** — no wrappers, extension builds directly onto the runtime
- **Types are self-contained** — designed to be moved to `@lucid-agents/types/xmpt` at merge time
- **Extension pattern** — follows the exact same pattern as `@lucid-agents/a2a` (build → placeholder, onBuild → full runtime)

### All PRD Requirements Met

| Requirement | Status | Notes |
|---|---|---|
| PR-1: `createAgent(...).use(xmpt(opts)).build()` | ✅ | Exact API implemented |
| PR-2: Inbox skill (`xmpt-inbox`) | ✅ | Auto-registered, Zod-validated |
| PR-3: `send()` + `sendAndWait()` | ✅ | URL/card peer, A2A delivery |
| PR-4: `receive()` + `onMessage()` + `listMessages()` | ✅ | All implemented |
| PR-5: Local-first dev experience | ✅ | Two-agent example included |
| PR-6: Manifest discoverability | ✅ | `xmpt-inbox` tags in agent card |
| TDD delivery | ✅ | 43 tests, all passing |
| Deterministic error codes | ✅ | `XMPTError` with 5 typed codes |

### Types Surface (matching PRD spec)

```typescript
// Content
type XMPTContent = { text?: string; data?: unknown; mime?: string }

// Message
type XMPTMessage = {
  id: string; threadId?: string; from?: string; to?: string;
  content: XMPTContent; metadata?: Record<string, unknown>; createdAt: string;
}

// Peer
type XMPTPeer = { url: string } | { card: AgentCard }

// Delivery Result
type XMPTDeliveryResult = { taskId: string; status: string; messageId: string }

// Runtime API (exposed at runtime.xmpt)
interface XMPTRuntime {
  send(peer, message, options?): Promise<XMPTDeliveryResult>
  sendAndWait(peer, message, options?): Promise<XMPTDeliveryResult>
  receive(message): Promise<XMPTReply | undefined>
  onMessage(handler): () => void  // returns unsubscribe fn
  listMessages(filters?): Promise<XMPTStoredMessage[]>
}
```

### Error Model (deterministic, as specified)

```typescript
const XMPT_ERROR = {
  PEER_NOT_REACHABLE: 'XMPT_PEER_NOT_REACHABLE',
  INBOX_SKILL_MISSING: 'XMPT_INBOX_SKILL_MISSING',
  INVALID_MESSAGE: 'XMPT_INVALID_MESSAGE',
  SEND_TIMEOUT: 'XMPT_SEND_TIMEOUT',
  NO_INBOX_CONFIGURED: 'XMPT_NO_INBOX_CONFIGURED',
}
```

## Test Results

```
 43 pass
  0 fail
 77 expect() calls
Ran 43 tests across 5 files. [32.00ms]
```

Tests cover:
- Store filtering (threadId, direction, from, to, since, limit)
- Runtime receive + inbox handler invocation
- onMessage subscription / unsubscription
- Subscriber isolation (error in one doesn't kill others)
- Extension wiring (build + onBuild + onManifestBuild)
- Manifest tagging for discoverability
- Message building with auto-generated id/createdAt
- Error codes and XMPTError class
- Thread preservation across send/receive

## How to Run

```bash
git clone https://github.com/stupeterwilliams-ui/lucid-agents-xmpt
cd lucid-agents-xmpt
bun install
bun test
bun run type-check
```

## Assumptions & Decisions

1. **No live deployment required** — this is an SDK package/library, not a service. The deliverable is the npm-publishable package code + GitHub repo.

2. **Peer-to-peer via A2A task protocol** — `send()` uses `@lucid-agents/a2a`'s `sendMessage()` + `getTask()` for polling, exactly as the PRD specifies ("XMPT uses A2A transport only").

3. **Types remain in-package for now** — the PRD mentions moving them to `@lucid-agents/types/xmpt` at monorepo merge time; they're isolated and ready for that move.

4. **`sendAndWait()` uses polling** — as the PRD suggests for MVP (SSE where available is deferred).

5. **In-memory store only** — persistence deferred per PRD non-goals.

6. **Inbox is optional** — an agent can be send-only with no inbox config.

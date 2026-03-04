# @lucid-agents/xmpt — Submission

## What I Built

A complete implementation of `@lucid-agents/xmpt` — an agent-to-agent messaging extension for the Lucid SDK, as specified in [issue #171](https://github.com/daydreamsai/lucid-agents/issues/171).

## GitHub Repository

**https://github.com/stupeterwilliams-ui/lucid-agents-xmpt**

## How It Solves the Task

### Builder Pattern (PR-1)

Follows the exact Lucid extension builder pattern from the PRD:

```ts
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

await runtime.xmpt.send(
  { url: 'http://localhost:8788' },
  { content: { text: 'hello' }, threadId: 't-1' }
);
```

`runtime.xmpt` is injected directly — no wrapper layer.

### Full Runtime API (PR-3 / PR-4)

| Method | Description |
|--------|-------------|
| `send(peer, message, opts?)` | Send fire-and-forget |
| `sendAndWait(peer, message, opts?)` | Send and poll until task complete |
| `receive(message)` | Dispatch to inbox handler + notify subscribers |
| `onMessage(handler)` | Subscribe to incoming messages (returns unsub fn) |
| `listMessages(filter?)` | Query store by threadId, from, to, since, limit |

### Inbox Entrypoint (PR-2)

`xmpt()` automatically registers an entrypoint at key `xmpt-inbox` (configurable). Remote agents POST messages to this skill. The handler receives typed `XMPTMessage` and can return a reply.

### Transport Modes

- **`agentm`** (default): Uses A2A task-based protocol — POSTs to `/tasks`, supports polling via `sendAndWait`
- **`http`**: Direct POST to `/xmpt/inbox` on the peer — simpler, lower overhead

### In-Memory Store (PR-3)

`MemoryStore` persists all inbound and outbound messages with filtering by:
- `threadId` — thread continuity preserved across messages
- `from`, `to` — directional filters
- `since` — ISO timestamp filter
- `limit` — result cap

### Manifest Discoverability (PR-4 / PR-6)

`onManifestBuild()` hooks into the card build pipeline to add:
1. **XMPT inbox skill** tagged with `['xmpt', 'inbox', 'messaging', 'a2a']` — discoverable via any skill directory
2. **Capabilities extension** `{ id: 'xmpt', transport, inboxSkillId, preferredSkillId }` — remote agents can discover XMPT capability programmatically

## Architecture

```
packages/
  xmpt/
    src/
      extension.ts   — xmpt() factory: build/onBuild/onManifestBuild hooks
      runtime.ts     — XMPTRuntimeImpl: send/receive/onMessage/listMessages
      client.ts      — Low-level: resolvePeerUrl, sendViaAgentm, sendViaHttp, pollTaskUntilComplete
      store/
        memory.ts    — MemoryStore: in-memory message persistence
      __tests__/
        store.test.ts        — store CRUD + filtering
        client.test.ts       — peer resolution + send functions
        runtime.test.ts      — receive/onMessage/listMessages/send
        extension.test.ts    — extension wiring + manifest tagging
        integration.test.ts  — two-agent E2E (mocked HTTP)
    types/
      index.ts       — All XMPT type definitions (XMPTMessage, XMPTPeer, XMPTRuntime, ...)
  example/
    src/
      local-messaging.ts  — Local two-agent E2E demo
  types-xmpt/
    src/
      index.ts       — Standalone type package (mirrors @lucid-agents/types/xmpt)
```

## Test Results

```
bun test

 96 pass
 0 fail
 165 expect() calls
Ran 96 tests across 10 files. [294.00ms]
```

All 96 tests pass. Tests follow TDD — failing tests written first, then implementation to make them green:

- **Milestone 1** — Types + Extension skeleton (`extension.test.ts`, `types.test.ts`)
- **Milestone 2** — Send/receive core (`client.test.ts`, `runtime.test.ts`)
- **Milestone 3** — Threading + store (`store.test.ts`)
- **Milestone 4** — Manifest discoverability (`extension.test.ts` manifest tests)
- **Milestone 5** — Local E2E integration (`integration.test.ts` — mocked HTTP two-agent scenario)

## Local E2E Output

```
🚀 Starting XMPT local two-agent demo

✅ Agent beta listening on port 8788
✅ Agent alpha listening on port 8787

📤 alpha → beta: "hello from alpha" (thread: demo-thread-1)
📬 beta received: "hello from alpha" (thread: demo-thread-1)
   delivery result: taskId=http-..., status=delivered, messageId=...

--- Verification ---
beta.listMessages({ threadId: "demo-thread-1" }) → 1 message(s)
✅ Beta received the correct message
📬 beta received: "second message" (thread: demo-thread-1)
beta.listMessages({ threadId: "demo-thread-1" }) after 2nd msg → 2 message(s)
✅ Thread continuity preserved across messages

🎉 XMTP local messaging demo complete!
```

## Technical Notes & Design Decisions

1. **No new transport protocol** — XMPT is a semantic layer over existing A2A/HTTP primitives, exactly as specified in the PRD's Architecture Constraints.

2. **Core runtime remains agnostic** — `xmpt` extension injects `runtime.xmpt` in `onBuild()` without requiring changes to `@lucid-agents/core`.

3. **Subscriber isolation** — `onMessage` subscriber errors are caught and swallowed so they cannot break the receive path.

4. **Thread ID generation** — If `threadId` is omitted in a `send()` call, a new UUID is generated. Callers can pass a fixed `threadId` for conversation continuity.

5. **`sendAndWait` polling** — Uses 200ms poll intervals with a configurable timeout (default 30s). Works with agentm transport; HTTP transport returns immediately (no task to poll).

6. **Peer resolution** — Supports both `{ url }` and `{ card: { url } }` peer formats, consistent with the `XMTPeer` type in the PRD.

7. **Inbox registration is safe** — If the user manually registered the inbox entrypoint key before calling `.use(xmpt(...))`, the duplicate is silently ignored.

8. **Manifest discoverability** — `onManifestBuild()` adds the xmpt skill to the agent card even if it wasn't pre-registered, ensuring remote agents can always discover XMPT capability.

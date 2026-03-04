# Monorepo Integration Guide

This document describes how to integrate `@lucid-agents/xmpt` into the `daydreamsai/lucid-agents` monorepo.

## File Changes Required

### 1. New package: `packages/xmpt/`

Copy the entire `packages/xmpt/` directory from this submission.

Update `package.json` dependencies to use workspace protocol:
```json
{
  "dependencies": {
    "@lucid-agents/types": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@lucid-agents/core": "workspace:*",
    "@lucid-agents/http": "workspace:*",
    "tsup": "catalog:",
    "typescript": "catalog:"
  }
}
```

### 2. Types: `packages/types/src/xmpt/index.ts`

Create this new file with contents from `packages/types-xmpt/src/index.ts`, but updating the import:
```ts
import type { AgentCard } from '../a2a';  // instead of @lucid-agents/a2a
```

### 3. Types: `packages/types/src/core/runtime.ts`

Add the `xmpt` optional field:
```ts
import type { XMPTRuntime } from '../xmpt';

export type AgentRuntime = {
  agent: AgentCore;
  wallets?: WalletsRuntime;
  payments?: PaymentsRuntime;
  analytics?: AnalyticsRuntime;
  a2a?: A2ARuntime;
  xmpt?: XMPTRuntime;   // ← ADD THIS
  ap2?: AP2Runtime;
  scheduler?: SchedulerRuntime;
  handlers?: AgentHttpHandlers;
  entrypoints: EntrypointsRuntime;
  manifest: ManifestRuntime;
};
```

### 4. Types: `packages/types/src/index.ts`

Add the xmpt export:
```ts
export * from './xmpt';
```

### 5. Types: `packages/types/package.json`

Add the export map entry:
```json
{
  "exports": {
    "./xmpt": {
      "types": "./dist/xmpt/index.d.ts",
      "import": "./dist/xmpt/index.js",
      "default": "./dist/xmpt/index.js"
    }
  }
}
```

### 6. Example: `packages/examples/src/xmpt/local-messaging.ts`

Copy from `packages/examples/src/xmpt/local-messaging.ts`, updating imports to use package names:
```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { a2a } from '@lucid-agents/a2a';
import { xmpt } from '@lucid-agents/xmpt';
```

## Architecture Principle

**XMPT is a semantic layer over existing A2A/HTTP task primitives.** The core runtime remains extension-agnostic — the `xmpt` field on `AgentRuntime` is optional, and XMPT doesn't modify any existing extension behavior.

Transport flow:
```
runtime.xmpt.send(peer, msg)
  → HTTP POST /entrypoints/xmpt-inbox/invoke
  → remote agent's inbox entrypoint handler
  → reply returned in HTTP response body
```

This reuses the standard Lucid entrypoint invocation pattern rather than introducing a custom wire protocol.

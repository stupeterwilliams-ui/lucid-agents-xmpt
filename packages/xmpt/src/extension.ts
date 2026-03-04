/**
 * XMPT Extension — wires xmpt() into the Lucid Agent builder.
 *
 * Usage:
 *   createAgent(config)
 *     .use(http())
 *     .use(a2a())
 *     .use(xmpt({ inbox: { handler: async ({ message }) => ... } }))
 *     .build()
 *
 * Also supports transport option for capability discovery:
 *   xmpt({ transport: 'agentm', inbox: { ... } })
 */

import { createXMPTRuntime } from './runtime.js';
import type { XMPTRuntime } from './types-internal.js';
import type { XMPTRuntimeInternals } from './runtime.js';

const DEFAULT_INBOX_KEY = 'xmpt-inbox';

/** Options for the xmpt() extension (superset of XMPTOptions). */
export type XMPTExtensionOptions = {
  /** Inbox configuration. */
  inbox?: {
    key?: string;
    handler: (ctx: { message: any; skillKey: string }) => Promise<{ content: any; metadata?: any } | void | null>;
  };
  /** Custom message store. */
  store?: any;
  /** Discovery options. */
  discovery?: { preferredSkillId?: string };
  /** Base URL of this agent. */
  selfUrl?: string;
  /**
   * Transport mode declaration for capability metadata.
   * Default: 'agentm'
   */
  transport?: string;
};

/**
 * Creates the XMPT extension.
 */
export function xmpt(options: XMPTExtensionOptions = {}): {
  name: string;
  build(ctx: Record<string, unknown>): { xmpt: XMPTRuntime };
  onBuild(runtime: Record<string, unknown>): void | Promise<void>;
  onManifestBuild(card: Record<string, unknown>, runtime: Record<string, unknown>): Record<string, unknown>;
} {
  const inboxKey = options.inbox?.key ?? DEFAULT_INBOX_KEY;
  const transport = options.transport ?? 'agentm';
  const discoverySkillId = options.discovery?.preferredSkillId ?? inboxKey;

  // Lazily-created runtime — ensures it exists whether build() or onBuild() is called first
  let _runtime: XMPTRuntimeInternals | undefined;

  function ensureRuntime(): XMPTRuntimeInternals {
    if (!_runtime) {
      _runtime = createXMPTRuntime(options as any);
    }
    return _runtime;
  }

  return {
    name: 'xmpt',

    build(_ctx) {
      return { xmpt: ensureRuntime() };
    },

    async onBuild(runtime) {
      const rt = ensureRuntime();

      // Inject xmpt runtime onto the agent runtime object
      (runtime as any).xmpt = rt;

      // Register the inbox entrypoint if a handler is configured
      if (!options.inbox) return;

      const entrypoints = (runtime as any).entrypoints;
      if (!entrypoints?.add) {
        console.warn('[xmpt] runtime.entrypoints.add not available — inbox skill not registered');
        return;
      }

      entrypoints.add({
        key: inboxKey,
        description: `XMPT inbox — accepts agent-to-agent messages. Tags: xmpt, inbox`,
        tags: ['xmpt', 'inbox', 'messaging'],

        async handler({ input }: { input: Record<string, unknown> }) {
          const message = input as any;
          const reply = await rt._handleInbound(message);

          return {
            output: reply
              ? {
                  content: (reply as any).content,
                  metadata: (reply as any).metadata,
                  createdAt: new Date().toISOString(),
                }
              : null,
          };
        },
      });
    },

    onManifestBuild(card, _runtime) {
      const skills = Array.isArray((card as any).skills)
        ? [...((card as any).skills as Record<string, unknown>[])]
        : [];

      const capabilities = {
        ...((card as any).capabilities as Record<string, unknown> ?? {}),
      };

      // ── Skills ──────────────────────────────────────────────────────────────
      if (options.inbox) {
        const existingIdx = skills.findIndex(
          (s) => s.id === inboxKey || s.id === discoverySkillId
        );

        const baseTags = existingIdx >= 0
          ? ((skills[existingIdx].tags as string[]) ?? [])
          : [];

        const mergedTags = Array.from(
          new Set([...baseTags, 'xmpt', 'inbox', 'messaging', 'a2a'])
        );

        const xmptSkill = {
          ...(existingIdx >= 0 ? skills[existingIdx] : {}),
          id: inboxKey,
          name: 'XMPT Inbox',
          description: 'Accepts agent-to-agent messages via XMPT protocol',
          tags: mergedTags,
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        };

        if (existingIdx >= 0) {
          skills[existingIdx] = xmptSkill;
        } else {
          skills.push(xmptSkill);
        }
      }

      // ── Capabilities.extensions ─────────────────────────────────────────────
      const extensions = Array.isArray(capabilities.extensions)
        ? [...(capabilities.extensions as Record<string, unknown>[])]
        : [];

      const existingCapIdx = extensions.findIndex((e) => (e as any).id === 'xmpt');
      const xmptCap = {
        id: 'xmpt',
        transport,
        inboxSkillId: inboxKey,
        preferredSkillId: discoverySkillId,
      };

      if (existingCapIdx >= 0) {
        extensions[existingCapIdx] = xmptCap;
      } else {
        extensions.push(xmptCap);
      }

      capabilities.extensions = extensions;

      return {
        ...card,
        skills,
        capabilities,
      };
    },
  };
}

import type { XMPTOptions, XMPTRuntime } from '../types/index.js';
import { createMemoryStore } from './store/memory.js';
import { createXMPTRuntime } from './runtime.js';

/**
 * XMPT extension for the Lucid SDK agent builder.
 *
 * Usage:
 * ```ts
 * createAgent(config)
 *   .use(http())
 *   .use(a2a())
 *   .use(xmpt({
 *     transport: 'agentm',
 *     inbox: {
 *       key: 'xmpt-inbox',
 *       handler: async ({ message }) => ({
 *         content: { text: `ack:${message.content.text ?? ''}` },
 *       }),
 *     },
 *   }))
 *   .build()
 * ```
 */
export function xmpt(opts: XMPTOptions = {}): {
  name: string;
  build: (ctx: any) => { xmpt: XMPTRuntime };
  onBuild: (runtime: any) => void | Promise<void>;
  onManifestBuild: (card: any, runtime: any) => any;
} {
  const {
    transport = 'agentm',
    inbox,
    store = createMemoryStore(),
    discovery,
  } = opts;

  const inboxKey = inbox?.key ?? 'xmpt-inbox';

  // We create the runtime lazily in onBuild so it can access the agent's own URL.
  let xmptRuntime: XMPTRuntime | null = null;

  return {
    name: 'xmpt',

    build(_ctx: any): { xmpt: XMPTRuntime } {
      // Return placeholder — will be replaced in onBuild
      return { xmpt: {} as XMPTRuntime };
    },

    onBuild(runtime: any): void | Promise<void> {
      // Determine this agent's own URL (best-effort)
      const agentUrl: string | undefined =
        runtime?.agent?.config?.meta?.url ??
        (typeof process !== 'undefined' && process.env.AGENT_URL
          ? process.env.AGENT_URL
          : undefined);

      xmptRuntime = createXMPTRuntime({
        transport,
        inboxKey,
        inboxHandler: inbox?.handler,
        store,
        agentUrl,
      });

      // Inject into the runtime object
      runtime.xmpt = xmptRuntime;

      // Register the inbox entrypoint so remote agents can deliver messages
      if (inbox?.handler) {
        try {
          runtime.entrypoints.add({
            key: inboxKey,
            description: 'XMPT message inbox — accepts agent-to-agent messages',
            tags: ['xmpt', 'inbox', 'messaging'],
            input: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                threadId: { type: 'string' },
                from: { type: 'string' },
                to: { type: 'string' },
                content: { type: 'object' },
                metadata: { type: 'object' },
                createdAt: { type: 'string' },
              },
              required: ['id', 'threadId', 'content', 'createdAt'],
            },
            async handler({ input }: { input: any }) {
              const reply = await xmptRuntime!.receive(input);
              return {
                output: reply ?? { status: 'received', messageId: input.id },
              };
            },
          });
        } catch (e) {
          // entrypoint key may already exist if user registered it manually — ignore
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('already')) {
            throw e;
          }
        }
      }
    },

    onManifestBuild(card: any, _runtime: any): any {
      // Tag the skill for discoverability
      if (!card.skills) card.skills = [];

      const alreadyTagged = card.skills.some(
        (s: any) => s.id === inboxKey
      );

      if (!alreadyTagged && inbox?.handler) {
        card.skills.push({
          id: inboxKey,
          name: 'XMPT Inbox',
          description: 'Accepts agent-to-agent messages via the XMPT protocol',
          tags: ['xmpt', 'inbox', 'messaging', 'a2a'],
          inputModes: ['application/json', 'application/json+xmpt'],
          outputModes: ['application/json'],
        });
      }

      // Mark XMPT capability in the card
      if (!card.capabilities) card.capabilities = {};
      if (!card.capabilities.extensions) card.capabilities.extensions = [];
      card.capabilities.extensions.push({
        id: 'xmpt',
        version: '0.1.0',
        transport,
        inboxSkillId: inboxKey,
        preferredSkillId: discovery?.preferredSkillId ?? inboxKey,
      });

      return card;
    },
  };
}

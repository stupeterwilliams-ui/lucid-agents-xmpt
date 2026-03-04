/**
 * XMPT Extension — plugs into the Lucid agent builder via .use(xmpt(opts)).
 *
 * Responsibilities:
 * 1. Build the XMPTRuntime and attach it to the agent runtime as `runtime.xmpt`
 * 2. Register the inbox skill in the agent's entrypoint registry
 * 3. Hook into manifest build to add xmpt discovery metadata
 */

import type { Extension } from '@lucid-agents/types/core';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import { createXMPTRuntime } from './runtime.js';
import type { XMPTOptions, XMPTRuntime } from './types.js';
import { XMPTError, XMPT_ERROR } from './types.js';
import { z } from 'zod';

export const XMPT_INBOX_SKILL_TAG = 'xmpt-inbox';
export const XMPT_INBOX_DEFAULT_KEY = 'xmpt-inbox';

// Zod schema for validating incoming XMPT messages at the inbox entrypoint
const XMPTContentSchema = z.object({
  text: z.string().optional(),
  data: z.unknown().optional(),
  mime: z.string().optional(),
});

const XMPTMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  content: XMPTContentSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

const XMPTInboxInputSchema = z.object({
  message: XMPTMessageSchema,
});

const XMPTInboxOutputSchema = z.object({
  reply: z
    .object({
      content: XMPTContentSchema,
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  accepted: z.boolean(),
});

export function xmpt(options: XMPTOptions = {}): Extension<{ xmpt: XMPTRuntime }> {
  const inboxKey = options.inbox?.key ?? XMPT_INBOX_DEFAULT_KEY;

  return {
    name: 'xmpt',

    build(_ctx) {
      // Return a placeholder — runtime is fully wired in onBuild
      return { xmpt: {} as XMPTRuntime };
    },

    onBuild(runtime) {
      // Create the full runtime and attach it
      const xmptRuntime = createXMPTRuntime(runtime, options);
      (runtime as Record<string, unknown>)['xmpt'] = xmptRuntime;

      // Register the inbox skill if configured
      if (options.inbox) {
        const handler = options.inbox.handler;

        runtime.entrypoints.add({
          key: inboxKey,
          description: 'XMPT inbox — receives typed agent-to-agent messages',
          input: XMPTInboxInputSchema,
          output: XMPTInboxOutputSchema,
          async handler({ input }: { input: unknown }) {
            // Validate message
            const inputObj = input as Record<string, unknown>;
            const parsed = XMPTMessageSchema.safeParse(inputObj['message']);
            if (!parsed.success) {
              throw new XMPTError(
                XMPT_ERROR.INVALID_MESSAGE,
                `Invalid XMPT message: ${parsed.error.message}`
              );
            }

            const message = parsed.data;

            // Route through the xmpt runtime so subscribers and store are notified
            const xmpt = (runtime as Record<string, unknown>)['xmpt'] as XMPTRuntime;
            const reply = await xmpt.receive(message);

            return {
              output: {
                accepted: true,
                reply: reply ?? undefined,
              },
            };
          },
        });
      }
    },

    onManifestBuild(card: AgentCardWithEntrypoints, _runtime): AgentCardWithEntrypoints {
      if (!options.inbox) {
        return card;
      }

      // Tag the xmpt-inbox skill with discovery metadata
      const updatedSkills = (card.skills ?? []).map((skill) => {
        if (skill.id === inboxKey) {
          return {
            ...skill,
            tags: [...(skill.tags ?? []), XMPT_INBOX_SKILL_TAG, 'messaging', 'a2a'],
            description:
              skill.description ?? 'XMPT inbox — receives agent-to-agent messages',
          };
        }
        return skill;
      });

      return {
        ...card,
        skills: updatedSkills,
      };
    },
  };
}

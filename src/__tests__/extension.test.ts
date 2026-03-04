/**
 * Tests: XMPT Extension wiring
 *
 * Tests that the extension properly integrates with the Lucid builder pattern.
 */

import { describe, it, expect, mock } from 'bun:test';
import { xmpt, XMPT_INBOX_SKILL_TAG, XMPT_INBOX_DEFAULT_KEY } from '../extension.js';
import type { XMPTMessage } from '../types.js';
import type { AgentRuntime } from '@lucid-agents/types/core';

// Minimal mock runtime for extension testing
function makeMockRuntime(): AgentRuntime & { _entrypoints: Map<string, unknown> } {
  const entrypoints = new Map<string, unknown>();
  const rt = {
    agent: {
      config: {
        meta: { name: 'test', version: '0.1.0' },
      },
    },
    entrypoints: {
      add: (def: unknown) => {
        const d = def as { key: string };
        entrypoints.set(d.key, d);
      },
      get: (key: string) => entrypoints.get(key),
      snapshot: () => [...entrypoints.values()],
      list: () => [...entrypoints.values()],
    },
    _entrypoints: entrypoints,
  } as unknown as AgentRuntime & { _entrypoints: Map<string, unknown> };
  return rt;
}

describe('xmpt() extension', () => {
  it('has name "xmpt"', () => {
    const ext = xmpt();
    expect(ext.name).toBe('xmpt');
  });

  it('build() returns { xmpt: {} } placeholder', () => {
    const ext = xmpt();
    const result = ext.build({ meta: { name: 'test', version: '0.1.0' }, runtime: {} as Partial<AgentRuntime> });
    expect(result).toHaveProperty('xmpt');
  });

  it('onBuild attaches xmpt runtime to agent runtime', () => {
    const ext = xmpt();
    const runtime = makeMockRuntime();
    ext.onBuild?.(runtime);

    const rt = runtime as unknown as Record<string, unknown>;
    expect(rt['xmpt']).toBeDefined();
    expect(typeof (rt['xmpt'] as Record<string, unknown>)['send']).toBe('function');
    expect(typeof (rt['xmpt'] as Record<string, unknown>)['receive']).toBe('function');
    expect(typeof (rt['xmpt'] as Record<string, unknown>)['onMessage']).toBe('function');
    expect(typeof (rt['xmpt'] as Record<string, unknown>)['listMessages']).toBe('function');
    expect(typeof (rt['xmpt'] as Record<string, unknown>)['sendAndWait']).toBe('function');
  });

  it('registers xmpt-inbox skill when inbox config provided', () => {
    const handler = mock(async () => undefined);
    const ext = xmpt({ inbox: { handler } });
    const runtime = makeMockRuntime();
    ext.onBuild?.(runtime);

    const skill = runtime._entrypoints.get(XMPT_INBOX_DEFAULT_KEY);
    expect(skill).toBeDefined();
    expect((skill as { key: string }).key).toBe(XMPT_INBOX_DEFAULT_KEY);
  });

  it('registers skill with custom key when provided', () => {
    const handler = mock(async () => undefined);
    const ext = xmpt({ inbox: { key: 'my-inbox', handler } });
    const runtime = makeMockRuntime();
    ext.onBuild?.(runtime);

    expect(runtime._entrypoints.has('my-inbox')).toBe(true);
    expect(runtime._entrypoints.has(XMPT_INBOX_DEFAULT_KEY)).toBe(false);
  });

  it('does not register inbox skill when no inbox config', () => {
    const ext = xmpt();
    const runtime = makeMockRuntime();
    ext.onBuild?.(runtime);

    expect(runtime._entrypoints.has(XMPT_INBOX_DEFAULT_KEY)).toBe(false);
  });

  it('inbox handler is called through runtime.xmpt.receive()', async () => {
    const handler = mock(async ({ message }: { message: XMPTMessage }) => ({
      content: { text: `echo:${message.content.text}` },
    }));

    const ext = xmpt({ inbox: { handler } });
    const runtime = makeMockRuntime();
    ext.onBuild?.(runtime);

    const rt = (runtime as unknown as Record<string, unknown>)['xmpt'] as {
      receive: (msg: XMPTMessage) => Promise<unknown>;
    };

    const reply = await rt.receive({
      id: 'test-id',
      content: { text: 'world' },
      createdAt: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect((reply as { content: { text: string } })?.content.text).toBe('echo:world');
  });

  describe('onManifestBuild()', () => {
    function makeCard(skillIds: string[] = []): import('@lucid-agents/types/a2a').AgentCardWithEntrypoints {
      return {
        name: 'test',
        version: '0.1.0',
        url: 'http://localhost:3000',
        skills: skillIds.map((id) => ({
          id,
          name: id,
          description: '',
          inputModes: [],
          outputModes: [],
        })),
        capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
        defaultInputModes: [],
        defaultOutputModes: [],
        entrypoints: {},
        supportsAuthenticatedExtendedCard: false,
        protocolVersion: '1.0',
        supportedInterfaces: [],
      };
    }

    it('adds xmpt tags to inbox skill', () => {
      const handler = mock(async () => undefined);
      const ext = xmpt({ inbox: { handler } });
      const runtime = makeMockRuntime();
      ext.onBuild?.(runtime);

      const card = makeCard([XMPT_INBOX_DEFAULT_KEY]);
      const updated = ext.onManifestBuild!(card, runtime);

      const skill = updated.skills?.find((s) => s.id === XMPT_INBOX_DEFAULT_KEY);
      expect(skill?.tags).toContain(XMPT_INBOX_SKILL_TAG);
      expect(skill?.tags).toContain('messaging');
    });

    it('does not modify card when no inbox configured', () => {
      const ext = xmpt();
      const runtime = makeMockRuntime();
      ext.onBuild?.(runtime);

      const card = makeCard(['some-other-skill']);
      const updated = ext.onManifestBuild!(card, runtime);

      // Card should be unchanged
      expect(updated).toEqual(card);
    });

    it('does not affect other skills', () => {
      const handler = mock(async () => undefined);
      const ext = xmpt({ inbox: { handler } });
      const runtime = makeMockRuntime();
      ext.onBuild?.(runtime);

      const card = makeCard([XMPT_INBOX_DEFAULT_KEY, 'other-skill']);
      const updated = ext.onManifestBuild!(card, runtime);

      const otherSkill = updated.skills?.find((s) => s.id === 'other-skill');
      expect(otherSkill?.tags).toBeUndefined();
    });
  });
});

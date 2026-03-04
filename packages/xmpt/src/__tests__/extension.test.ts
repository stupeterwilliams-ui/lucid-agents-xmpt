/**
 * Integration tests: xmpt() extension
 * TDD Milestones 1 & 4: Extension wiring + Manifest discoverability
 */
import { describe, it, expect } from 'bun:test';
import { xmpt } from '../extension.js';

// Minimal AgentRuntime mock
function makeMockRuntime(meta: Record<string, unknown> = {}): any {
  const entrypoints: any[] = [];
  return {
    agent: {
      config: {
        meta: { url: 'http://agent-a:8787', name: 'alpha', ...meta },
      },
    },
    entrypoints: {
      add: (ep: any) => entrypoints.push(ep),
      list: () => entrypoints,
      snapshot: () => entrypoints,
      _raw: entrypoints,
    },
    xmpt: undefined,
  };
}

describe('xmpt() extension', () => {
  it('returns an extension with name "xmpt"', () => {
    const ext = xmpt({});
    expect(ext.name).toBe('xmpt');
  });

  it('build() returns { xmpt } placeholder', () => {
    const ext = xmpt({});
    const slice = ext.build({});
    expect(slice).toHaveProperty('xmpt');
  });

  it('onBuild() injects xmpt runtime onto the runtime object', async () => {
    const ext = xmpt({
      inbox: {
        handler: async () => null,
      },
    });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    expect(runtime.xmpt).toBeDefined();
    expect(typeof runtime.xmpt.send).toBe('function');
    expect(typeof runtime.xmpt.receive).toBe('function');
    expect(typeof runtime.xmpt.onMessage).toBe('function');
    expect(typeof runtime.xmpt.listMessages).toBe('function');
    expect(typeof runtime.xmpt.sendAndWait).toBe('function');
  });

  it('onBuild() registers inbox entrypoint when handler provided', async () => {
    const ext = xmpt({
      inbox: {
        key: 'xmpt-inbox',
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text ?? ''}` },
        }),
      },
    });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    const ep = runtime.entrypoints._raw.find((e: any) => e.key === 'xmpt-inbox');
    expect(ep).toBeDefined();
    expect(ep.description).toContain('XMPT');
  });

  it('onBuild() does not register inbox entrypoint when no handler', async () => {
    const ext = xmpt({});
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    expect(runtime.entrypoints._raw).toHaveLength(0);
  });

  it('custom inbox key is used', async () => {
    const ext = xmpt({
      inbox: {
        key: 'custom-inbox-key',
        handler: async () => null,
      },
    });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    const ep = runtime.entrypoints._raw.find((e: any) => e.key === 'custom-inbox-key');
    expect(ep).toBeDefined();
  });

  it('onManifestBuild() adds XMPT skill to card', async () => {
    const ext = xmpt({
      inbox: {
        handler: async () => null,
      },
    });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    const card: any = { name: 'alpha', skills: [], capabilities: {} };
    const result = ext.onManifestBuild(card, runtime);

    const xmptSkill = result.skills.find((s: any) => s.id === 'xmpt-inbox');
    expect(xmptSkill).toBeDefined();
    expect(xmptSkill.tags).toContain('xmpt');
    expect(xmptSkill.tags).toContain('inbox');
  });

  it('onManifestBuild() adds xmpt capability extension', async () => {
    const ext = xmpt({ transport: 'agentm' });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    const card: any = { name: 'alpha', capabilities: { extensions: [] } };
    const result = ext.onManifestBuild(card, runtime);

    const xmptCap = result.capabilities.extensions.find(
      (e: any) => e.id === 'xmpt'
    );
    expect(xmptCap).toBeDefined();
    expect(xmptCap.transport).toBe('agentm');
    expect(xmptCap.inboxSkillId).toBe('xmpt-inbox');
  });

  it('inbox handler is called when receive() is invoked', async () => {
    const received: any[] = [];
    const ext = xmpt({
      inbox: {
        handler: async ({ message }) => {
          received.push(message);
          return { content: { text: 'ack' } };
        },
      },
    });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    const reply = await runtime.xmpt.receive({
      id: 'test-msg',
      threadId: 't-test',
      content: { text: 'ping' },
      createdAt: new Date().toISOString(),
    });

    expect(received).toHaveLength(1);
    expect((reply as any)?.content?.text).toBe('ack');
  });

  it('entrypoint handler calls receive() and returns reply', async () => {
    const ext = xmpt({
      inbox: {
        handler: async ({ message }) => ({
          content: { text: `echo:${message.content.text}` },
        }),
      },
    });
    const runtime = makeMockRuntime();
    await ext.onBuild(runtime);

    const ep = runtime.entrypoints._raw.find((e: any) => e.key === 'xmpt-inbox');
    expect(ep).toBeDefined();

    const result = await ep.handler({
      input: {
        id: 'ep-msg',
        threadId: 't-ep',
        content: { text: 'test-via-ep' },
        createdAt: new Date().toISOString(),
      },
    });

    expect(result.output?.content?.text).toBe('echo:test-via-ep');
  });
});

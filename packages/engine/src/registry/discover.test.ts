import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { toolList } from '../mcp';
import { type DiscoverDeps, type DiscoveryRun, discover } from './discover';
import { bundledRegistry } from './load';

const registry = bundledRegistry();
const md = readFileSync(
  join(__dirname, '../../test/fixtures/recommender-sample.md'),
  'utf8',
);
const specs = {
  prd: 'A todo web app. Users sign in and pay with Stripe. React and Vite.',
  design: 'Clean landing page.',
  architecture: 'React + Vite, Supabase auth, Vercel.',
};
const base = (over: Partial<DiscoverDeps> = {}): DiscoverDeps => ({
  registry,
  specs,
  rejected: { ids: new Set(), repoKeys: new Set() },
  ensurePlugin: async () => '/plugins/claude-code-setup',
  runAgent: async () => ({ status: 'success', text: '', submitted: null }),
  ...over,
});
const ids = (r: { candidates: { id: string }[] }) =>
  r.candidates.map((c) => c.id);

test('uses what the agent submitted through submit_suggestions', async () => {
  const runAgent = vi.fn(async () => ({
    status: 'success' as const,
    text: '',
    submitted: {
      suggestions: [
        { id: 'supabase', why: 'Auth and Postgres live in Supabase.' },
        {
          name: 'Acme Maps',
          kind: 'mcp' as const,
          category: 'MCP Servers',
          why: 'Maps.',
          repoUrl: 'https://github.com/acme/maps-mcp',
        },
        { id: 'does-not-exist', why: 'made up' },
      ],
    },
  }));
  const r = await discover(base({ runAgent }));
  expect(r.source).toBe('tool');
  expect(ids(r)).toEqual(expect.arrayContaining(['supabase', 'acme-maps']));
  expect(r.candidates.find((c) => c.id === 'supabase')?.reason).toContain(
    'Auth and Postgres',
  );
  expect(r.candidates.find((c) => c.id === 'acme-maps')).toMatchObject({
    verified: false,
    source: 'recommender',
  });
  // an id that is not in the registry is dropped, not trusted
  expect(ids(r)).not.toContain('does-not-exist');
});

test('the run gets the plugin dir for this run only, read-only tools, and the specs and registry ids in the prompt', async () => {
  const runAgent = vi.fn(async (_req: DiscoveryRun) => ({
    status: 'success' as const,
    text: '',
    submitted: null,
  }));
  await discover(base({ runAgent }));
  const req = runAgent.mock.calls[0]?.[0] as DiscoveryRun;
  expect(req.pluginDirs).toEqual(['/plugins/claude-code-setup']);
  expect(req.allowedTools).toEqual(
    expect.arrayContaining([
      'Read',
      'Glob',
      'Grep',
      'WebSearch',
      'mcp__awp__submit_suggestions',
    ]),
  );
  expect(req.disallowedTools).toEqual(
    expect.arrayContaining(['Bash', 'Write', 'Edit']),
  );
  expect(req.prompt).toContain('Stripe');
  expect(req.prompt).toContain('context7: Context7');
  expect(req.prompt).toContain('submit_suggestions');
});

test('falls back to parsing the recommender markdown when the tool was not called', async () => {
  const r = await discover(
    base({
      runAgent: async () => ({ status: 'success', text: md, submitted: null }),
    }),
  );
  expect(r.source).toBe('markdown');
  expect(ids(r)).toEqual(
    expect.arrayContaining([
      'supabase',
      'stripe-checkout-flow',
      'security-reviewer',
    ]),
  );
});

test('falls back to registry matching alone when the run fails', async () => {
  const r = await discover(
    base({
      runAgent: async () => {
        throw new Error('claude exploded');
      },
    }),
  );
  expect(r.source).toBe('registry-only');
  expect(r.note).toMatch(/claude exploded/);
  // registry matching still ran
  expect(ids(r)).toEqual(
    expect.arrayContaining(['graphify', 'context7', 'stripe']),
  );
});

test('an errored run with no output also falls back', async () => {
  const r = await discover(
    base({
      runAgent: async () => ({ status: 'error', text: '', submitted: null }),
    }),
  );
  expect(r.source).toBe('registry-only');
});

test('without the plugin the agent is not run at all', async () => {
  const runAgent = vi.fn(async () => ({
    status: 'success' as const,
    text: md,
    submitted: null,
  }));
  const r = await discover(base({ ensurePlugin: async () => null, runAgent }));
  expect(runAgent).not.toHaveBeenCalled();
  expect(r.source).toBe('registry-only');
  expect(r.note).toMatch(/recommender/i);
  const r2 = await discover(
    base({
      ensurePlugin: async () => {
        throw new Error('offline');
      },
      runAgent,
    }),
  );
  expect(r2.source).toBe('registry-only');
});

test('rejected items stay rejected even when the agent suggests them again', async () => {
  const r = await discover(
    base({
      rejected: { ids: new Set(['supabase']), repoKeys: new Set() },
      runAgent: async () => ({
        status: 'success',
        text: '',
        submitted: { suggestions: [{ id: 'supabase', why: 'again' }] },
      }),
    }),
  );
  expect(ids(r)).not.toContain('supabase');
});

test('every awp MCP tool the discovery run is allowed to call is exposed by the MCP proxy', async () => {
  const runAgent = vi.fn(async (_req: DiscoveryRun) => ({
    status: 'success' as const,
    text: '',
    submitted: null,
  }));
  await discover(base({ runAgent }));
  const req = runAgent.mock.calls[0]?.[0] as DiscoveryRun;
  const exposed = new Set<string>(toolList().map((t) => t.name));
  const wanted = req.allowedTools
    .filter((t) => t.startsWith('mcp__awp__'))
    .map((t) => t.slice('mcp__awp__'.length));
  expect(wanted.length).toBeGreaterThan(0);
  for (const name of wanted) expect(exposed.has(name), name).toBe(true);
  // the proxy's schema for it is a real object schema with the suggestions array
  const tool = toolList().find((t) => t.name === 'submit_suggestions');
  expect(JSON.stringify(tool?.inputSchema)).toContain('suggestions');
});

test('the discovery run ignores project settings, hooks and MCP servers, and has no way to write, fetch or spawn', async () => {
  const runAgent = vi.fn(async (_req: DiscoveryRun) => ({
    status: 'success' as const,
    text: '',
    submitted: null,
  }));
  await discover(base({ runAgent }));
  const req = runAgent.mock.calls[0]?.[0] as DiscoveryRun;
  expect(req.settingSources).toEqual(['user']);
  expect(req.strictMcpConfig).toBe(true);
  for (const t of [
    'Bash',
    'Write',
    'Edit',
    'NotebookEdit',
    'WebFetch',
    'Task',
    'Agent',
    'PowerShell',
  ])
    expect(req.disallowedTools, t).toContain(t);
});

test('a hook or subagent the agent submits becomes an unverified idea, not an install', async () => {
  const r = await discover(
    base({
      runAgent: async () => ({
        status: 'success',
        text: '',
        submitted: {
          suggestions: [
            {
              name: 'Block .env edits',
              kind: 'hook' as const,
              category: 'Hooks',
              why: 'Keeps secrets out of commits.',
            },
            {
              name: 'security-reviewer',
              kind: 'subagent' as const,
              category: 'Subagents',
              why: 'Reviews auth code.',
            },
          ],
        },
      }),
    }),
  );
  const hook = r.candidates.find((c) => c.id === 'block-env-edits');
  expect(hook).toMatchObject({
    verified: false,
    idea: true,
    source: 'recommender',
  });
  expect(r.candidates.find((c) => c.id === 'security-reviewer')).toMatchObject({
    idea: true,
  });
});

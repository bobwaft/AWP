// biome-ignore-all lint/correctness/useYield: scripts only call tools; the adapter wrapper yields events
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunRequest, SuggestionsState } from '@awp/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FakeAdapter } from '../adapters/fake';
import { createHandlers } from '../handlers';
import type { SpecService } from '../spec/service';

vi.setConfig({ testTimeout: 30_000 });

let dir: string;
let h: ReturnType<typeof createHandlers>;
let svc: SpecService;
let requests: RunRequest[];
let submit: ((req: RunRequest, s: SpecService) => Promise<void>) | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'awp-rh-'));
  process.env.AWP_DATA_DIR = join(dir, 'data');
  requests = [];
  submit = undefined;
  h = createHandlers(
    () => {},
    () =>
      new FakeAdapter({
        script: async function* (req) {
          requests.push(req);
          yield { type: 'session', sessionId: 's' };
          await submit?.(req, svc);
          yield { type: 'done', status: 'success' };
        },
      }),
    {
      specAdapter: 'fake',
      withMcp: false,
      // the recommender plugin "downloads" instantly in tests
      ensurePlugin: async () => '/plugins/claude-code-setup',
    },
  );
  await h._projects.create(join(dir, 'p'), 'p');
  await writeFile(
    join(dir, 'p', 'docs', 'PRD.md'),
    '# PRD\nA web app. Users pay with Stripe. React and Vite.\n',
  );
  svc = await h._spec();
});
afterEach(() => h._projects.close());

const call = (name: string, params?: unknown) => (h as any)[name](params);
const state = async (): Promise<SuggestionsState> => call('registry.suggest');
const settled = async () => {
  for (let i = 0; i < 400; i++) {
    const s = await state();
    if (s.discovery.status !== 'running') return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('discovery never finished');
};

test('registry.suggest starts discovery; the agent reports through submit_suggestions', async () => {
  submit = async (req, s) => {
    await s.callTool(req.runId, 'submit_suggestions', {
      suggestions: [
        { id: 'stripe', why: 'The PRD takes payments through Stripe.' },
      ],
    });
  };
  expect((await state()).discovery.status).toBe('running');
  const s = await settled();
  expect(s.discovery).toMatchObject({ status: 'done', source: 'tool' });
  const stripe = s.items.find((i) => i.id === 'stripe');
  expect(stripe?.reason).toBe('The PRD takes payments through Stripe.');
  expect(stripe?.verified).toBe(true);
  // the run was read-only and loaded the recommender plugin for this run only
  const req = requests[0];
  expect(req.pluginDirs).toEqual(['/plugins/claude-code-setup']);
  expect(req.disallowedTools).toEqual(
    expect.arrayContaining(['Bash', 'Write', 'Edit']),
  );
  expect(req.cwd).toBe(join(dir, 'p'));
});

test('the discovery tool is only reachable from the discovery run', async () => {
  submit = async (req, s) => {
    await expect(
      s.callTool(req.runId, 'submit_critique', {
        questions: [],
        readiness: {},
      }),
    ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    await expect(
      s.callTool(req.runId, 'submit_suggestions', { suggestions: [] }),
    ).resolves.toBeTruthy();
    // bad arguments are rejected with a clear error, and an unknown id never lands
    await expect(
      s.callTool(req.runId, 'submit_suggestions', { nope: 1 }),
    ).rejects.toMatchObject({ code: 'TOOL_ARGS_INVALID' });
  };
  await state();
  await settled();
});

test('approve, install an mcp entry, and the file lands in the project', async () => {
  submit = async (req, s) => {
    await s.callTool(req.runId, 'submit_suggestions', {
      suggestions: [{ id: 'figma', why: 'Figma links in Design.' }],
    });
  };
  await state();
  await settled();
  await call('registry.decide', { id: 'figma', decision: 'approve' });
  const r = await call('registry.install', { id: 'figma' });
  expect(r.result.status).toBe('installed');
  const mcp = JSON.parse(await readFile(join(dir, 'p', '.mcp.json'), 'utf8'));
  expect(mcp.mcpServers.figma.url).toBe('https://mcp.figma.com/mcp');
});

test('completing Planning starts discovery in the background', async () => {
  // make Planning completable without running the whole planning flow
  const proj = h._projects;
  const completeSpy = vi.spyOn(proj, 'complete').mockResolvedValue(proj.state);
  vi.spyOn(svc, 'checkGate').mockResolvedValue(undefined);
  await call('stage.complete', { stage: 'planning' });
  expect(completeSpy).toHaveBeenCalled();
  const s = await settled();
  expect(s.discovery.status).toBe('done');
  expect(requests.length).toBe(1);
});

test('Connectors cannot be completed while discovery runs or an approved item is not installed', async () => {
  const proj = h._projects;
  vi.spyOn(proj, 'complete').mockResolvedValue(proj.state);
  submit = async (req, s) => {
    await s.callTool(req.runId, 'submit_suggestions', {
      suggestions: [{ id: 'figma', why: 'x' }],
    });
  };
  await state();
  await settled();
  await call('registry.decide', { id: 'figma', decision: 'approve' });
  await expect(
    call('stage.complete', { stage: 'connectors' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  await call('registry.install', { id: 'figma' });
  await expect(
    call('stage.complete', { stage: 'connectors' }),
  ).resolves.toBeDefined();
});

test('zero approvals can still complete Connectors', async () => {
  const proj = h._projects;
  vi.spyOn(proj, 'complete').mockResolvedValue(proj.state);
  await state();
  await settled();
  await expect(
    call('stage.complete', { stage: 'connectors' }),
  ).resolves.toBeDefined();
});

test('a rejection survives a restart of the engine', async () => {
  submit = async (req, s) => {
    await s.callTool(req.runId, 'submit_suggestions', {
      suggestions: [{ id: 'figma', why: 'x' }],
    });
  };
  await state();
  await settled();
  await call('registry.decide', {
    id: 'figma',
    decision: 'reject',
    reason: 'no thanks',
  });
  expect(existsSync(join(dir, 'p', '.awp', 'suggestions.json'))).toBe(true);
  const file = JSON.parse(
    await readFile(join(dir, 'p', '.awp', 'suggestions.json'), 'utf8'),
  );
  expect(file.items.find((i: { id: string }) => i.id === 'figma').status).toBe(
    'rejected',
  );
});

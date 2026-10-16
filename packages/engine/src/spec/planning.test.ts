// biome-ignore-all lint/correctness/useYield: test scripts only call tools; the adapter wrapper yields events
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Phase,
  parsePhasesMd,
  type RunRequest,
  type SpecSnapshot,
} from '@awp/protocol';
import { afterEach, expect, test } from 'vitest';
import { FakeAdapter } from '../adapters/fake';
import { createHandlers } from '../handlers';
import type { SpecService } from './service';

const verify = {
  install: 'bun install',
  typecheck: 'bun run typecheck',
  lint: 'bun run lint',
  test: 'bun run test',
  build: 'bun run build',
};
const option = (id: string) => ({
  id,
  name: id.toUpperCase(),
  summary: `${id} summary`,
  stack: ['Language: TypeScript'],
  pros: ['fast'],
  cons: ['young'],
  fit: `${id} fits`,
  verify,
});
const phase = (n: number, o: Partial<Phase> = {}): Phase => ({
  n,
  title: `P${n}`,
  goal: `Goal ${n}`,
  tasks: ['a', 'b'],
  files: ['src/x.ts'],
  acceptance: ['works'],
  checklist: ['click'],
  ui: false,
  ...o,
});

type Ph = 'architect' | 'phaser' | 'critic';
const phOf = (r: RunRequest): Ph =>
  r.allowedTools?.includes('mcp__awp__submit_stack_options')
    ? 'architect'
    : r.allowedTools?.includes('mcp__awp__submit_phase_plan')
      ? 'phaser'
      : 'critic';

let dir: string;
let notes: { m: string; p: any }[];
let h: ReturnType<typeof createHandlers>;
let svc: SpecService;
const seen: Record<Ph, string[]> = { architect: [], phaser: [], critic: [] };
let planAttempts: any[] = [];

async function setup(opts: { badFirst?: boolean; blocking?: boolean } = {}) {
  dir = await mkdtemp(join(tmpdir(), 'awp-plan-'));
  notes = [];
  planAttempts = [];
  for (const k of Object.keys(seen) as Ph[]) seen[k] = [];
  h = createHandlers(
    (m, p) => notes.push({ m, p }),
    () =>
      new FakeAdapter({
        script: async function* (req) {
          const ph = phOf(req);
          seen[ph].push(req.prompt);
          yield { type: 'session', sessionId: 's' };
          if (ph === 'architect')
            await svc.callTool(req.runId, 'submit_stack_options', {
              options: [option('bun-react'), option('rails')],
            });
          if (ph === 'phaser') {
            if (opts.badFirst && seen.phaser.length === 1)
              planAttempts.push(
                await svc
                  .callTool(req.runId, 'submit_phase_plan', {
                    phases: [phase(1, { acceptance: [] })],
                  })
                  .catch((e) => e),
              );
            planAttempts.push(
              await svc.callTool(req.runId, 'submit_phase_plan', {
                phases: [phase(1), phase(2, { ui: true })],
              }),
            );
          }
          if (ph === 'critic')
            await svc.callTool(req.runId, 'submit_critique', {
              questions: opts.blocking
                ? [{ text: 'Phase 2 depends on auth', blocking: true }]
                : [],
              readiness: { overview: 90, stack: 90, verify: 90, phases: 80 },
            });
          yield { type: 'done', status: 'success' };
        },
      }),
    { specAdapter: 'fake', withMcp: false },
  );
  await h._projects.create(join(dir, 'p'), 'p');
  svc = await h._spec();
}
const call = (n: string, p?: unknown) => (h as any)[n](p);
const snap = (): Promise<SpecSnapshot> =>
  call('spec.get', { stage: 'planning' });
const idle = async () => {
  for (let i = 0; i < 300; i++) {
    const s = await snap();
    if (!s.busy) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('busy');
};
const read = (f: string) => readFile(join(dir, 'p', 'docs', f), 'utf8');
afterEach(() => h?._projects.close());

test('architect proposes 2-3 options; nothing is written or critiqued until one is picked', async () => {
  await setup();
  await call('chat.send', { stage: 'planning', text: 'a notes app for web' });
  const s = await idle();
  expect(s.stackOptions?.map((o) => o.id)).toEqual(['bun-react', 'rails']);
  expect(s.stackPicked).toBeNull();
  expect(existsSync(join(dir, 'p/docs/ARCHITECTURE.md'))).toBe(false);
  expect(seen.critic).toHaveLength(0);
  await expect(
    call('stage.complete', { stage: 'planning' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
});

test('pick -> ARCHITECTURE.md with the five verify commands -> phase plan -> critic -> gate opens', async () => {
  await setup();
  await call('chat.send', { stage: 'planning', text: 'notes app' });
  await idle();
  await call('plan.pickStack', {
    optionId: 'bun-react',
    edits: { verify: { test: 'vitest run' }, notes: 'Use SQLite' },
  });
  const s = await idle();
  const arch = await read('ARCHITECTURE.md');
  for (const c of [
    'bun install',
    'bun run typecheck',
    'bun run lint',
    'vitest run',
    'bun run build',
  ])
    expect(arch).toContain(`\`${c}\``);
  expect(arch).not.toContain('`bun run test`');
  expect(arch).toContain('Use SQLite');
  expect(s.stackPicked).toMatchObject({
    optionId: 'bun-react',
    verify: { test: 'vitest run' },
  });
  const { phases, errors } = parsePhasesMd(await read('PHASES.md'));
  expect(errors).toEqual([]);
  expect(phases.map((p) => p.n)).toEqual([1, 2]);
  expect(s.rounds).toBe(1);
  expect(s.blocking).toBe(0);
  await h._projects.complete('ideation', 'skip');
  await h._projects.complete('design', 'skip');
  const done = await call('stage.complete', { stage: 'planning' });
  expect(done.stages.planning.status).toBe('complete');
});

test('the phase planner is told to fix an invalid plan (no acceptance criteria) and resubmit', async () => {
  await setup({ badFirst: true });
  await call('chat.send', { stage: 'planning', text: 'x' });
  await idle();
  await call('plan.pickStack', { optionId: 'rails' });
  await idle();
  expect(planAttempts[0]).toMatchObject({ code: 'PLAN_INVALID' });
  expect(planAttempts[0].message).toContain('needs acceptance criteria');
  expect(planAttempts[1]).toMatchObject({ ok: true, phases: 2 });
});

test('pick validation: unknown option, empty verify command, busy', async () => {
  await setup();
  await call('chat.send', { stage: 'planning', text: 'x' });
  await idle();
  await expect(
    call('plan.pickStack', { optionId: 'nope' }),
  ).rejects.toMatchObject({ code: 'STACK_NOT_FOUND' });
  await expect(
    call('plan.pickStack', {
      optionId: 'rails',
      edits: { verify: { lint: '  ' } },
    }),
  ).rejects.toMatchObject({ code: 'VERIFY_INVALID' });
  expect(existsSync(join(dir, 'p/docs/ARCHITECTURE.md'))).toBe(false);
});

test('feedback after a pick re-runs the phase planner, not the architect', async () => {
  await setup();
  await call('chat.send', { stage: 'planning', text: 'x' });
  await idle();
  await call('plan.pickStack', { optionId: 'rails' });
  await idle();
  const architectRuns = seen.architect.length;
  await call('chat.send', { stage: 'planning', text: 'make phase 1 smaller' });
  await idle();
  expect(seen.architect).toHaveLength(architectRuns);
  expect(seen.phaser).toHaveLength(2);
  expect(seen.phaser[1]).toContain('make phase 1 smaller');
});

test('gate: hand-breaking PHASES.md blocks completion; blocking questions block; the barrel saves edits', async () => {
  await setup({ blocking: true });
  await call('chat.send', { stage: 'planning', text: 'x' });
  await idle();
  await call('plan.pickStack', { optionId: 'rails' });
  await idle();
  await expect(
    call('stage.complete', { stage: 'planning' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  const { phases } = await call('plan.phases');
  expect(phases).toHaveLength(2);
  const bad = await call('plan.savePhases', {
    phases: [phase(1, { acceptance: [] })],
  });
  expect(bad.errors).toContain('Phase 1: needs acceptance criteria');
  expect((await call('plan.phases')).errors).toContain(
    'Phase 1: needs acceptance criteria',
  );
  const ok = await call('plan.savePhases', {
    phases: [phase(1), phase(2), phase(3)],
  });
  expect(ok.errors).toEqual([]);
  expect((await call('plan.phases')).phases).toHaveLength(3);
  await writeFile(
    join(dir, 'p/docs/PHASES.md'),
    '# Phases\n\n## Phase 1: X\n**Goal:** g\n### Tasks\n- t\n',
  );
  expect((await call('plan.phases')).errors).toContain(
    'Phase 1: needs acceptance criteria',
  );
});

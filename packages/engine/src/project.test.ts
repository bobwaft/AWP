import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { gitService } from './git';
import { ProjectService } from './project';

let dir: string;
let svc: ProjectService;
let events: { m: string; p: unknown }[];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'awp-'));
  events = [];
  svc = new ProjectService(join(dir, 'data'), (m, p) => events.push({ m, p }));
});
afterEach(() => svc.close());

test('create writes the layout, inits git on awp/build, and commits cleanly', async () => {
  const root = join(dir, 'acme');
  const s = await svc.create(root, 'acme');
  for (const f of [
    'CLAUDE.md',
    'MEMORY.md',
    'BUGS.md',
    '.gitignore',
    'docs',
    '.awp/state.json',
    '.git',
  ])
    expect(existsSync(join(root, f)), f).toBe(true);
  expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain('# acme');
  expect(await gitService.branch(root)).toBe('awp/build');
  expect(await gitService.isClean(root)).toBe(true);
  expect(s.stages.ideation.status).toBe('active');
  await expect(svc.create(root, 'acme')).rejects.toMatchObject({
    code: 'PROJECT_EXISTS',
  });
});

test('state survives a restart: a new service reopens the same stage', async () => {
  const root = join(dir, 'acme');
  await svc.create(root, 'acme');
  await svc.complete('ideation');
  const svc2 = new ProjectService(join(dir, 'data'), () => {});
  const s = await svc2.open(root);
  expect(s.current).toBe('design');
  expect(s.stages.ideation.status).toBe('complete');
  svc2.close();
});

test('every mutation persists and broadcasts state.changed; errors keep state', async () => {
  const root = join(dir, 'acme');
  await svc.create(root, 'acme');
  await svc.complete('ideation', 'ok');
  expect(events.at(-1)?.m).toBe('state.changed');
  expect(
    JSON.parse(readFileSync(join(root, '.awp/state.json'), 'utf8')).stages
      .ideation.override.reason,
  ).toBe('ok');
  await expect(svc.complete('planning')).rejects.toMatchObject({
    code: 'STAGE_NOT_ACTIVE',
  });
});

test('open on a non-project folder fails with PROJECT_NOT_FOUND; mutate without a project fails', async () => {
  await expect(svc.open(dir)).rejects.toMatchObject({
    code: 'PROJECT_NOT_FOUND',
  });
  await expect(svc.enter('ideation')).rejects.toMatchObject({
    code: 'NO_PROJECT',
  });
});

test('list summarises recents: stage, phases, open bugs, missing folders', async () => {
  const root = join(dir, 'acme');
  await svc.create(root, 'acme');
  await writeFile(
    join(root, 'BUGS.md'),
    '# BUGS\n## BUG-001\n- Status: open\n## BUG-002\n- Status: fixed\n',
  );
  const [a] = await svc.list();
  expect(a).toMatchObject({
    name: 'acme',
    stage: 'ideation',
    openBugs: 1,
    phasesTotal: 0,
    missing: false,
  });
  await svc.create(join(dir, 'gone'), 'gone');
  const { rm } = await import('node:fs/promises');
  await rm(join(dir, 'gone'), { recursive: true });
  expect((await svc.list()).find((p) => p.name === 'gone')?.missing).toBe(true);
});

test('editing a completed stage spec marks later stages stale (watcher)', async () => {
  const root = join(dir, 'acme');
  await svc.create(root, 'acme');
  await svc.complete('ideation');
  await svc.complete('design');
  await writeFile(join(root, 'docs', 'PRD.md'), '# changed');
  await new Promise((r) => setTimeout(r, 700));
  expect(events.some((e) => e.m === 'spec.changed')).toBe(true);
  const s = await new ProjectService(join(dir, 'data'), () => {}).open(root);
  expect(s.stages.design.status).toBe('stale');
}, 10000);

test('git service: tag, diff stats, clean-tree check in a temp repo', async () => {
  const root = join(dir, 'g');
  await svc.create(root, 'g');
  await writeFile(join(root, 'a.txt'), 'one\ntwo\n');
  expect(await gitService.isClean(root)).toBe(false);
  const sha = await gitService.commitAll(root, 'add a');
  await gitService.tag(root, 'awp/phase-1');
  expect(sha).toMatch(/^[0-9a-f]{7,}$/);
  await writeFile(join(root, 'a.txt'), 'one\n');
  expect(await gitService.diffStats(root)).toMatchObject({
    files: 1,
    deletions: 1,
  });
});

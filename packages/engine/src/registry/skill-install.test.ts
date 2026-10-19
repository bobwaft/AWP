import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';

// Each test builds real git repos and fetches from them; git is slow on Windows.
vi.setConfig({ testTimeout: 60_000 });

import { EngineError } from '../errors';
import { fetchSource } from './git-fetch';
import { buildPreview, checkPath } from './preview';
import { makeRepo } from './test-repo';
import { installSkill } from './writers/skill';

const tmp = () => mkdtempSync(join(tmpdir(), 'awp-t-'));
const SKILL = '---\nname: demo\ndescription: d\n---\n# Demo\nDo the thing.\n';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};

const open = (
  repo: ReturnType<typeof makeRepo>,
  path = 'skills/demo',
  tree?: string,
) =>
  fetchSource({
    cacheDir: tmp(),
    repo: repo.url,
    sha: repo.sha,
    path,
    expectedTree: tree ?? repo.tree(path),
    allowAnyUrl: true,
  });

test('fetches the pinned commit and the tree hash matches git', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL, 'README.md': 'x' });
  const src = await open(repo);
  expect(src.tree).toBe(repo.tree('skills/demo'));
  expect(src.files.map((f) => f.path)).toEqual(['SKILL.md']);
});

test('later commits to the repo do not change what a pinned sha returns', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const pinned = repo.sha;
  repo.commit({ 'skills/demo/SKILL.md': `${SKILL}EVIL\n` });
  const src = await fetchSource({
    cacheDir: tmp(),
    repo: repo.url,
    sha: pinned,
    path: 'skills/demo',
    allowAnyUrl: true,
  });
  expect((await src.read('SKILL.md')).toString()).toBe(SKILL);
});

test('a tree that differs from the registry value is refused', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  expect(await code(open(repo, 'skills/demo', 'a'.repeat(40)))).toBe(
    'TREE_MISMATCH',
  );
});

test('a sha that is gone gives SOURCE_GONE and never falls back to a branch', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const r = fetchSource({
    cacheDir: tmp(),
    repo: repo.url,
    sha: 'b'.repeat(40),
    path: 'skills/demo',
    allowAnyUrl: true,
  });
  expect(await code(r)).toBe('SOURCE_GONE');
});

test('a missing path gives PATH_NOT_FOUND', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  expect(await code(open(repo, 'skills/nope', 'a'.repeat(40)))).toBe(
    'PATH_NOT_FOUND',
  );
});

test('only https://github.com sources are accepted outside tests', async () => {
  const r = fetchSource({
    cacheDir: tmp(),
    repo: 'http://github.com/a/b',
    sha: 'a'.repeat(40),
    path: 'x',
  });
  expect(await code(r)).toBe('SOURCE_NOT_ALLOWED');
  const r2 = fetchSource({
    cacheDir: tmp(),
    repo: 'https://evil.example/a/b',
    sha: 'a'.repeat(40),
    path: 'x',
  });
  expect(await code(r2)).toBe('SOURCE_NOT_ALLOWED');
});

// ---- preview: safety rules ----

test('symlinks and submodules are rejected', async () => {
  const link = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/link': { content: '../../secret', mode: '120000' },
  });
  expect(await code(buildPreview(await open(link)))).toBe(
    'SYMLINK_NOT_ALLOWED',
  );
  const sub = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/mod': { content: 'c'.repeat(40), mode: '160000' },
  });
  expect(await code(buildPreview(await open(sub)))).toBe(
    'SUBMODULE_NOT_ALLOWED',
  );
});

test('unsafe paths are refused', () => {
  for (const bad of [
    '../x',
    'a/../x',
    '/abs',
    'C:/x',
    'a\\b',
    'a/.git/config',
    '.GIT/x',
    'con.txt',
    'a/NUL',
    'LPT1.md',
    'trail.',
    'trail /x',
    'a:b',
  ])
    expect(() => checkPath(bad), bad).toThrow(EngineError);
  for (const ok of ['SKILL.md', 'references/a.md', 'scripts/run.sh', '.hidden'])
    expect(() => checkPath(ok), ok).not.toThrow();
});

test('names that collide when case is ignored are refused', async () => {
  const repo = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/A.md': { content: 'a', index: true },
    'skills/demo/a.md': { content: 'b', index: true },
  });
  expect(await code(buildPreview(await open(repo)))).toBe('CASE_COLLISION');
});

test('size and count caps apply', async () => {
  const big = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/big.md': 'x'.repeat(2000),
  });
  expect(
    await code(buildPreview(await open(big), { maxFileBytes: 1000 })),
  ).toBe('FILE_TOO_LARGE');
  const many = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/a.md': 'a',
    'skills/demo/b.md': 'b',
    'skills/demo/c.md': 'c',
  });
  expect(await code(buildPreview(await open(many), { maxFiles: 3 }))).toBe(
    'TOO_MANY_FILES',
  );
  const total = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/a.md': 'a'.repeat(600),
    'skills/demo/b.md': 'b'.repeat(600),
  });
  expect(
    await code(buildPreview(await open(total), { maxTotalBytes: 1000 })),
  ).toBe('SKILL_TOO_LARGE');
});

test('a skill folder needs a SKILL.md at its root', async () => {
  const repo = makeRepo({ 'skills/demo/README.md': 'x' });
  expect(await code(buildPreview(await open(repo)))).toBe('NOT_A_SKILL');
});

test('scripts, executables, shebangs, binaries and hooks are flagged', async () => {
  const repo = makeRepo({
    'skills/demo/SKILL.md':
      '---\nname: demo\ndescription: d\nallowed-tools: Bash\nhooks:\n  PreToolUse: x\n---\nbody\n',
    'skills/demo/run.sh': { content: '#!/bin/sh\necho hi\n', mode: '100755' },
    'skills/demo/tool': '#!/usr/bin/env node\nconsole.log(1)\n',
    'skills/demo/lib.py': 'print(1)\n',
    'skills/demo/blob.bin': 'ab\0cd',
    'skills/demo/notes.md': '# notes\n',
  });
  const p = await buildPreview(await open(repo));
  const flags = Object.fromEntries(p.files.map((f) => [f.path, f.flags]));
  expect(flags['run.sh']).toEqual(
    expect.arrayContaining(['script', 'executable', 'shebang']),
  );
  expect(flags.tool).toContain('shebang');
  expect(flags['lib.py']).toContain('script');
  expect(flags['blob.bin']).toContain('binary');
  expect(flags['SKILL.md']).toEqual(
    expect.arrayContaining(['allowed-tools', 'hooks']),
  );
  expect(flags['notes.md']).toEqual([]);
  expect(p.needsScriptConfirm).toBe(true);
  // flagged scripts are shown inline; SKILL.md text is always included
  expect(p.skillMd).toContain('Bash');
  expect(p.scripts.map((s) => s.path)).toEqual(
    expect.arrayContaining(['run.sh', 'tool', 'lib.py']),
  );
});

test('a plain markdown skill needs no script confirmation', async () => {
  const repo = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/references/a.md': 'ref',
  });
  const p = await buildPreview(await open(repo));
  expect(p.needsScriptConfirm).toBe(false);
  expect(p.files.map((f) => f.path)).toEqual(['SKILL.md', 'references/a.md']);
});

test('the preview id changes when any byte changes', async () => {
  const a = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const b = makeRepo({ 'skills/demo/SKILL.md': `${SKILL}x\n` });
  const pa = await buildPreview(await open(a));
  const pb = await buildPreview(await open(b));
  expect(pa.previewId).not.toBe(pb.previewId);
  const pa2 = await buildPreview(await open(a));
  expect(pa2.previewId).toBe(pa.previewId);
});

// ---- install ----

const project = () => {
  const d = tmp();
  mkdirSync(join(d, '.claude'), { recursive: true });
  return d;
};

test('installs exactly the previewed bytes and records the install', async () => {
  const repo = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/references/a.md': 'ref\r\nline',
  });
  const p = await buildPreview(await open(repo));
  const root = project();
  await installSkill({ root, itemId: 'demo', preview: p });
  const dir = join(root, '.claude', 'skills', 'demo');
  expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe(SKILL);
  // bytes are untouched (no CRLF conversion)
  expect(readFileSync(join(dir, 'references', 'a.md'), 'utf8')).toBe(
    'ref\r\nline',
  );
  const marker = JSON.parse(
    readFileSync(join(dir, '.awp-install.json'), 'utf8'),
  );
  expect(marker).toMatchObject({ itemId: 'demo', previewId: p.previewId });
  // no temp folders are left behind
  expect(readdirSync(join(root, '.claude', 'skills'))).toEqual(['demo']);
});

test('scripts need an explicit confirmation to install', async () => {
  const repo = makeRepo({
    'skills/demo/SKILL.md': SKILL,
    'skills/demo/run.sh': { content: '#!/bin/sh\n', mode: '100755' },
  });
  const p = await buildPreview(await open(repo));
  const root = project();
  expect(await code(installSkill({ root, itemId: 'demo', preview: p }))).toBe(
    'SCRIPTS_NOT_CONFIRMED',
  );
  expect(existsSync(join(root, '.claude', 'skills', 'demo'))).toBe(false);
  await installSkill({
    root,
    itemId: 'demo',
    preview: p,
    confirmScripts: true,
  });
  expect(existsSync(join(root, '.claude', 'skills', 'demo', 'run.sh'))).toBe(
    true,
  );
});

test('a folder AWP did not install is never overwritten; its own installs are replaced', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const p = await buildPreview(await open(repo));
  const root = project();
  const mine = join(root, '.claude', 'skills', 'demo');
  mkdirSync(mine, { recursive: true });
  writeFileSync(join(mine, 'SKILL.md'), 'the user wrote this');
  expect(await code(installSkill({ root, itemId: 'demo', preview: p }))).toBe(
    'TARGET_EXISTS',
  );
  expect(readFileSync(join(mine, 'SKILL.md'), 'utf8')).toBe(
    'the user wrote this',
  );

  const root2 = project();
  await installSkill({ root: root2, itemId: 'demo', preview: p });
  const repo2 = makeRepo({ 'skills/demo/SKILL.md': `${SKILL}v2\n` });
  const p2 = await buildPreview(await open(repo2));
  await installSkill({ root: root2, itemId: 'demo', preview: p2 });
  expect(
    readFileSync(join(root2, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf8'),
  ).toContain('v2');
});

test('an item id cannot escape the skills folder', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const p = await buildPreview(await open(repo));
  for (const itemId of ['../evil', 'a/b', '..', 'a\\b', ''])
    expect(
      await code(installSkill({ root: project(), itemId, preview: p })),
      itemId,
    ).toBe('INVALID_ID');
});

test('the preview is frozen: changing its buffers afterwards cannot change what installs', async () => {
  const repo = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const p = await buildPreview(await open(repo));
  const root = project();
  // try to tamper with the in-memory bytes after the user saw them
  try {
    (p.blobs.get('SKILL.md') as Buffer).write('EVIL');
  } catch {
    // frozen or copied: also fine
  }
  const result = await code(installSkill({ root, itemId: 'demo', preview: p }));
  const text = existsSync(join(root, '.claude', 'skills', 'demo', 'SKILL.md'))
    ? readFileSync(join(root, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf8')
    : '';
  // either the install refuses (hash mismatch) or it writes the original bytes, never EVIL
  expect(text.includes('EVIL')).toBe(false);
  expect(['NO_ERROR', 'PREVIEW_TAMPERED']).toContain(result);
});

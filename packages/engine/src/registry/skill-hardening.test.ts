import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { EngineError } from '../errors';
import type { Source } from './git-fetch';
import { buildPreview, checkPath } from './preview';
import { installSkill } from './writers/skill';

const tmp = () => mkdtempSync(join(tmpdir(), 'awp-sh-'));
const SKILL = '---\nname: demo\ndescription: d\n---\nbody\n';
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};

/** An in-memory skill folder (no git), optionally lying about sizes like a swapped local file. */
const mem = (
  files: Record<
    string,
    string | { content: string; mode?: string; listedSize?: number }
  >,
): Source => {
  const norm = Object.entries(files).map(([path, f]) =>
    typeof f === 'string'
      ? { path, content: f, mode: '100644', listedSize: undefined }
      : { path, mode: '100644', listedSize: undefined, ...f },
  );
  return {
    tree: 'mem',
    files: norm.map((f) => ({
      path: f.path,
      mode: f.mode,
      type: 'blob',
      oid: '',
      size: f.listedSize ?? Buffer.byteLength(f.content),
    })),
    read: async (p) =>
      Buffer.from(norm.find((f) => f.path === p)?.content ?? '', 'utf8'),
  };
};

// ---- preview checks that cannot be dodged ----

test('permission-widening front matter is flagged however it is written', async () => {
  const variants = {
    bom: `﻿---\nname: d\ndescription: d\nhooks:\n  PreToolUse: x\n---\nb`,
    quoted: `---\nname: d\ndescription: d\n'hooks':\n  PreToolUse: x\n---\nb`,
    dquoted: `---\nname: d\ndescription: d\n"allowed-tools": Bash\n---\nb`,
    indented: `---\nname: d\ndescription: d\n  hooks:\n    PreToolUse: x\n---\nb`,
    underscore: `---\nname: d\ndescription: d\nallowed_tools: Bash\n---\nb`,
    crlf: `---\r\nname: d\r\ndescription: d\r\nhooks:\r\n  PreToolUse: x\r\n---\r\nb`,
  };
  for (const [name, md] of Object.entries(variants)) {
    const p = await buildPreview(mem({ 'SKILL.md': md }));
    expect(p.needsScriptConfirm, name).toBe(true);
    expect(
      p.files[0].flags.some((f) => f === 'hooks' || f === 'allowed-tools'),
      name,
    ).toBe(true);
  }
  expect(
    (await buildPreview(mem({ 'SKILL.md': SKILL }))).needsScriptConfirm,
  ).toBe(false);
});

test('more executable and script types are flagged', async () => {
  for (const ext of [
    'psm1',
    'psd1',
    'wsf',
    'hta',
    'jar',
    'msi',
    'scr',
    'lnk',
    'reg',
    'vbe',
    'jse',
    'mts',
    'cts',
    'tsx',
    'jsx',
    'bat',
    'ps1',
  ]) {
    const p = await buildPreview(mem({ 'SKILL.md': SKILL, [`x.${ext}`]: 'x' }));
    expect(p.files.find((f) => f.path === `x.${ext}`)?.flags, ext).toContain(
      'script',
    );
  }
});

test('Windows device names and 8.3 aliases are refused', () => {
  for (const bad of [
    'CONIN$',
    'conout$',
    'CLOCK$',
    'COM¹.txt',
    'LPT².md',
    'CON .txt',
    'nul.',
    'a/COM3',
    'LONGNA~1.MD',
    'dir/PROGRA~1',
  ])
    expect(() => checkPath(bad), bad).toThrow(EngineError);
  for (const ok of [
    'console.md',
    'comet.md',
    'a.b.c',
    'tilde-name.md',
    'x~y.md',
  ])
    expect(() => checkPath(ok), ok).not.toThrow();
});

test('size caps use the bytes actually read, not the size that was listed', async () => {
  const liar = mem({
    'SKILL.md': SKILL,
    'big.md': { content: 'x'.repeat(2000), listedSize: 10 },
  });
  expect(await code(buildPreview(liar, { maxFileBytes: 1000 }))).toBe(
    'FILE_TOO_LARGE',
  );
  const many = mem({
    'SKILL.md': SKILL,
    'a.md': { content: 'a'.repeat(600), listedSize: 1 },
    'b.md': { content: 'b'.repeat(600), listedSize: 1 },
  });
  expect(await code(buildPreview(many, { maxTotalBytes: 1000 }))).toBe(
    'SKILL_TOO_LARGE',
  );
});

// ---- install location ----

const project = () => {
  const root = tmp();
  mkdirSync(join(root, '.claude'), { recursive: true });
  return root;
};

test('a skills folder that is a junction or symlink to somewhere else is refused, and nothing is written there', async () => {
  const root = project();
  const outside = tmp();
  try {
    symlinkSync(outside, join(root, '.claude', 'skills'), 'junction');
  } catch {
    return; // links cannot be created in this environment
  }
  const p = await buildPreview(mem({ 'SKILL.md': SKILL }));
  expect(await code(installSkill({ root, itemId: 'demo', preview: p }))).toBe(
    'INSTALL_PATH_ESCAPES',
  );
  expect(existsSync(join(outside, 'demo'))).toBe(false);
});

test('a .claude folder that is a link to somewhere else is refused too', async () => {
  const root = tmp();
  const outside = tmp();
  try {
    symlinkSync(outside, join(root, '.claude'), 'junction');
  } catch {
    return;
  }
  const p = await buildPreview(mem({ 'SKILL.md': SKILL }));
  expect(await code(installSkill({ root, itemId: 'demo', preview: p }))).toBe(
    'INSTALL_PATH_ESCAPES',
  );
  expect(existsSync(join(outside, 'skills'))).toBe(false);
});

// ---- the marker is not a free pass ----

test('an AWP install is only replaced while its files are unchanged; user edits are kept', async () => {
  const root = project();
  const v1 = await buildPreview(mem({ 'SKILL.md': SKILL, 'ref.md': 'one' }));
  await installSkill({ root, itemId: 'demo', preview: v1 });
  const dir = join(root, '.claude', 'skills', 'demo');
  // untouched: replacing with a newer version works
  const v2 = await buildPreview(
    mem({ 'SKILL.md': `${SKILL}v2\n`, 'ref.md': 'one' }),
  );
  await installSkill({ root, itemId: 'demo', preview: v2 });
  expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('v2');
  // the user edits a file: the next replace is refused and their edit survives
  writeFileSync(join(dir, 'ref.md'), 'my own notes');
  const v3 = await buildPreview(
    mem({ 'SKILL.md': `${SKILL}v3\n`, 'ref.md': 'three' }),
  );
  expect(await code(installSkill({ root, itemId: 'demo', preview: v3 }))).toBe(
    'TARGET_MODIFIED',
  );
  expect(readFileSync(join(dir, 'ref.md'), 'utf8')).toBe('my own notes');
  expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('v2');
});

test('a user file added to an AWP-installed folder also blocks the replace', async () => {
  const root = project();
  await installSkill({
    root,
    itemId: 'demo',
    preview: await buildPreview(mem({ 'SKILL.md': SKILL })),
  });
  const dir = join(root, '.claude', 'skills', 'demo');
  writeFileSync(join(dir, 'extra.md'), 'mine');
  const next = await buildPreview(mem({ 'SKILL.md': `${SKILL}v2\n` }));
  expect(
    await code(installSkill({ root, itemId: 'demo', preview: next })),
  ).toBe('TARGET_MODIFIED');
  expect(readFileSync(join(dir, 'extra.md'), 'utf8')).toBe('mine');
});

test('a hand-made marker without the install record does not make a folder replaceable', async () => {
  const root = project();
  const dir = join(root, '.claude', 'skills', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), 'someone elses skill');
  writeFileSync(
    join(dir, '.awp-install.json'),
    JSON.stringify({ itemId: 'demo' }),
  );
  const p = await buildPreview(mem({ 'SKILL.md': SKILL }));
  expect(await code(installSkill({ root, itemId: 'demo', preview: p }))).toBe(
    'TARGET_EXISTS',
  );
  expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe(
    'someone elses skill',
  );
});

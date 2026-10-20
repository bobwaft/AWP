import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { EngineError } from '../errors';
import { customFromLocal, customFromRepo, localSource } from './custom';
import { detectLicense } from './license';
import { buildPreview } from './preview';
import { makeRepo } from './test-repo';

vi.setConfig({ testTimeout: 60_000 });
const tmp = () => mkdtempSync(join(tmpdir(), 'awp-cu-'));
const SKILL = '---\nname: demo\ndescription: d\n---\nbody\n';
const MIT =
  'MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is hereby granted, free of charge, to any person obtaining a copy';
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};

test('detects common licenses from their text', () => {
  expect(detectLicense(MIT)).toBe('MIT');
  expect(detectLicense('Apache License\nVersion 2.0, January 2004')).toBe(
    'Apache-2.0',
  );
  expect(
    detectLicense('GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007'),
  ).toBe('GPL-3.0');
  expect(detectLicense('GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3')).toBe(
    'AGPL-3.0',
  );
  expect(detectLicense('Mozilla Public License Version 2.0')).toBe('MPL-2.0');
  expect(
    detectLicense(
      'Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met: 1. ... 2. ... 3. Neither the name',
    ),
  ).toBe('BSD-3-Clause');
  expect(
    detectLicense(
      'ISC License\n\nPermission to use, copy, modify, and/or distribute this software',
    ),
  ).toBe('ISC');
  expect(
    detectLicense(
      'This is free and unencumbered software released into the public domain.',
    ),
  ).toBe('Unlicense');
  expect(detectLicense('All rights reserved. Do whatever I say.')).toBe(
    'unknown',
  );
  expect(detectLicense('')).toBe('unknown');
});

test('a repo URL becomes an unverified skill pinned to a commit, with its tree and license', async () => {
  const r = makeRepo({ 'skills/demo/SKILL.md': SKILL, LICENSE: MIT });
  const c = await customFromRepo({
    repoUrl: r.url,
    path: 'skills/demo',
    cacheDir: tmp(),
    allowAnyUrl: true,
  });
  expect(c.item).toMatchObject({
    kind: 'skill',
    verified: false,
    license: 'MIT',
    install: { type: 'skill' },
    source: {
      repo: r.url,
      sha: r.sha,
      path: 'skills/demo',
      tree: r.tree('skills/demo'),
    },
  });
  expect(c.item.id).toBe('demo');
  expect(c.item.flags.notes.join(' ')).toMatch(/not reviewed by AWP/i);
  // the pinned item previews and passes the same checks as a registry skill
  expect((await buildPreview(c.src)).files.map((f) => f.path)).toEqual([
    'SKILL.md',
  ]);
});

test('an explicit commit is used instead of the default branch', async () => {
  const r = makeRepo({ 'skills/demo/SKILL.md': SKILL, LICENSE: MIT });
  const first = r.sha;
  r.commit({ 'skills/demo/SKILL.md': `${SKILL}newer\n` });
  const c = await customFromRepo({
    repoUrl: r.url,
    sha: first,
    path: 'skills/demo',
    cacheDir: tmp(),
    allowAnyUrl: true,
  });
  expect(c.item.source.sha).toBe(first);
});

test('a repo without a license file is "unknown"', async () => {
  const r = makeRepo({ 'skills/demo/SKILL.md': SKILL });
  const c = await customFromRepo({
    repoUrl: r.url,
    path: 'skills/demo',
    cacheDir: tmp(),
    allowAnyUrl: true,
  });
  expect(c.item.license).toBe('unknown');
});

test('a folder without SKILL.md, a bad path, or a non-GitHub URL is refused with a clear code', async () => {
  const r = makeRepo({ 'skills/demo/README.md': 'x' });
  expect(
    await code(
      customFromRepo({
        repoUrl: r.url,
        path: 'skills/demo',
        cacheDir: tmp(),
        allowAnyUrl: true,
      }),
    ),
  ).toBe('NOT_A_SKILL');
  expect(
    await code(
      customFromRepo({
        repoUrl: r.url,
        path: 'nope',
        cacheDir: tmp(),
        allowAnyUrl: true,
      }),
    ),
  ).toBe('PATH_NOT_FOUND');
  expect(
    await code(
      customFromRepo({ repoUrl: 'https://evil.example/a/b', cacheDir: tmp() }),
    ),
  ).toBe('SOURCE_NOT_ALLOWED');
  expect(
    await code(
      customFromRepo({ repoUrl: 'git@github.com:a/b.git', cacheDir: tmp() }),
    ),
  ).toBe('SOURCE_NOT_ALLOWED');
});

test('a local folder becomes an unverified skill that is previewed from disk', async () => {
  const d = tmp();
  mkdirSync(join(d, 'references'), { recursive: true });
  writeFileSync(join(d, 'SKILL.md'), SKILL);
  writeFileSync(join(d, 'references', 'a.md'), 'ref');
  const c = await customFromLocal(d);
  expect(c.item).toMatchObject({
    kind: 'skill',
    verified: false,
    install: { type: 'local' },
    license: 'unknown',
  });
  expect(c.item.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  const p = await buildPreview(c.src);
  expect(p.files.map((f) => f.path)).toEqual(['SKILL.md', 'references/a.md']);
});

test('local folders must be absolute existing folders, and .git is skipped', async () => {
  expect(await code(customFromLocal('relative/dir'))).toBe('INVALID_PATH');
  expect(await code(customFromLocal(join(tmp(), 'missing')))).toBe(
    'PATH_NOT_FOUND',
  );
  const f = join(tmp(), 'file.txt');
  writeFileSync(f, 'x');
  expect(await code(customFromLocal(f))).toBe('NOT_A_FOLDER');
  const d = tmp();
  writeFileSync(join(d, 'SKILL.md'), SKILL);
  mkdirSync(join(d, '.git'));
  writeFileSync(join(d, '.git', 'config'), 'x');
  expect(
    (await buildPreview((await customFromLocal(d)).src)).files.map(
      (x) => x.path,
    ),
  ).toEqual(['SKILL.md']);
});

test('a symbolic link in a local folder is refused by the preview', async () => {
  const d = tmp();
  writeFileSync(join(d, 'SKILL.md'), SKILL);
  writeFileSync(join(d, 'real.md'), 'x');
  try {
    symlinkSync(join(d, 'real.md'), join(d, 'link.md'));
  } catch {
    return; // creating symlinks needs privileges on some Windows setups
  }
  expect(await code(buildPreview((await customFromLocal(d)).src))).toBe(
    'SYMLINK_NOT_ALLOWED',
  );
});

test('a commit the user typed in is flagged: it may not be on the main branch', async () => {
  const r = makeRepo({ 'skills/demo/SKILL.md': SKILL, LICENSE: MIT });
  const typed = await customFromRepo({
    repoUrl: r.url,
    sha: r.sha,
    path: 'skills/demo',
    cacheDir: tmp(),
    allowAnyUrl: true,
  });
  expect(typed.item.flags.notes.join(' ')).toMatch(/commit you chose/i);
  const head = await customFromRepo({
    repoUrl: r.url,
    path: 'skills/demo',
    cacheDir: tmp(),
    allowAnyUrl: true,
  });
  expect(head.item.flags.notes.join(' ')).not.toMatch(/commit you chose/i);
});

test('a file swapped for a link after the folder was listed is not followed out of the folder', async () => {
  const d = tmp();
  const outside = tmp();
  writeFileSync(join(outside, 'secret.txt'), 'top secret');
  writeFileSync(join(d, 'SKILL.md'), SKILL);
  writeFileSync(join(d, 'a.md'), 'plain');
  const src = await localSource(d);
  rmSync(join(d, 'a.md'));
  try {
    symlinkSync(outside, join(d, 'a.md'), 'junction');
  } catch {
    return; // links cannot be created in this environment
  }
  await expect(src.read('a.md')).rejects.toBeInstanceOf(EngineError);
  // ordinary files still read fine
  expect((await src.read('SKILL.md')).toString()).toBe(SKILL);
});

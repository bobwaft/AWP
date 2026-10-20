import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { ensurePluginDir } from './plugin-cache';
import { makeRepo } from './test-repo';

vi.setConfig({ testTimeout: 60_000 });
const tmp = () => mkdtempSync(join(tmpdir(), 'awp-pc-'));

const files = {
  'plugins/setup/.claude-plugin/plugin.json': '{"name":"setup"}',
  'plugins/setup/skills/rec/SKILL.md':
    '---\nname: rec\ndescription: d\n---\nhi\n',
  'plugins/other/x.md': 'x',
};
const item = (r: ReturnType<typeof makeRepo>, over = {}) => ({
  repo: r.url,
  sha: r.sha,
  path: 'plugins/setup',
  tree: r.tree('plugins/setup'),
  ...over,
});

test('fetches the pinned plugin folder and returns a directory with its files', async () => {
  const r = makeRepo(files);
  const dir = await ensurePluginDir({
    dataDir: tmp(),
    source: item(r),
    allowAnyUrl: true,
  });
  expect(dir).not.toBeNull();
  expect(
    readFileSync(join(dir as string, '.claude-plugin', 'plugin.json'), 'utf8'),
  ).toBe('{"name":"setup"}');
  expect(existsSync(join(dir as string, 'skills', 'rec', 'SKILL.md'))).toBe(
    true,
  );
  expect(existsSync(join(dir as string, 'x.md'))).toBe(false);
});

test('a second call reuses the cached folder without fetching again', async () => {
  const r = makeRepo(files);
  const dataDir = tmp();
  const a = await ensurePluginDir({
    dataDir,
    source: item(r),
    allowAnyUrl: true,
  });
  // break the source: a cache hit must not need it
  const b = await ensurePluginDir({
    dataDir,
    source: { ...item(r), repo: 'file:///nowhere' },
    allowAnyUrl: true,
  });
  expect(b).toBe(a);
});

test('a tree that does not match the registry is refused (returns null)', async () => {
  const r = makeRepo(files);
  const dir = await ensurePluginDir({
    dataDir: tmp(),
    source: item(r, { tree: 'a'.repeat(40) }),
    allowAnyUrl: true,
  });
  expect(dir).toBeNull();
});

test('symlinks and unsafe paths in a plugin are refused', async () => {
  const r = makeRepo({
    ...files,
    'plugins/setup/link': { content: '../x', mode: '120000' },
  });
  expect(
    await ensurePluginDir({
      dataDir: tmp(),
      source: item(r),
      allowAnyUrl: true,
    }),
  ).toBeNull();
});

test('an unreachable source gives null, never a throw', async () => {
  const dir = await ensurePluginDir({
    dataDir: tmp(),
    source: {
      repo: 'file:///does/not/exist',
      sha: 'a'.repeat(40),
      path: 'plugins/setup',
    },
    allowAnyUrl: true,
  });
  expect(dir).toBeNull();
});

test('a source without a pinned commit is not used', async () => {
  expect(
    await ensurePluginDir({
      dataDir: tmp(),
      source: { repo: 'https://github.com/a/b' },
    }),
  ).toBeNull();
});

test('a pinned plugin may carry a screenshot over the skill file cap, but not an enormous file', async () => {
  // the real claude-code-setup plugin ships a 545 KB png; its tree hash is owner-reviewed
  const big = makeRepo({
    ...files,
    'plugins/setup/example.png': 'x'.repeat(600 * 1024),
  });
  const dir = await ensurePluginDir({
    dataDir: tmp(),
    source: item(big),
    allowAnyUrl: true,
  });
  expect(dir).not.toBeNull();
  const huge = makeRepo({
    ...files,
    'plugins/setup/huge.bin': 'x'.repeat(3 * 1024 * 1024),
  });
  expect(
    await ensurePluginDir({
      dataDir: tmp(),
      source: item(huge),
      allowAnyUrl: true,
    }),
  ).toBeNull();
});

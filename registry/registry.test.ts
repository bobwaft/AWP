import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { RegistryFile } from '../packages/protocol/src/registry';

const raw = JSON.parse(
  readFileSync(join(__dirname, 'registry.json'), 'utf8'),
) as unknown;
const reg = RegistryFile.parse(raw);
const byId = new Map(reg.items.map((i) => [i.id, i]));
const item = (id: string) => {
  const i = byId.get(id);
  if (!i) throw new Error(`missing registry item ${id}`);
  return i;
};

test('the seed registry parses and has unique ids', () => {
  expect(reg.items.length).toBeGreaterThan(40);
});

test('only owner-approved items are present (REGISTRY.md verification, 2026-10-19)', () => {
  // Not approved or not suggested into AWP projects: see REGISTRY.md.
  for (const id of [
    'serena',
    'claude-mem',
    'netlify',
    'semgrep-mcp',
    'omniroute',
    'spec-kit',
    'superpowers',
    'agent-skills',
    'feature-dev',
    'code-review',
    'pr-review-toolkit',
    'task-master',
  ])
    expect(byId.has(id), id).toBe(false);
  // Notion's hosted URL is not yet confirmed from an official source.
  expect(byId.has('notion')).toBe(false);
});

test('the pre-checked defaults are exactly the REGISTRY.md list', () => {
  const defaults = reg.items
    .filter((i) => i.default)
    .map((i) => i.id)
    .sort();
  expect(defaults).toEqual(
    [
      'context7',
      'graphify',
      'impeccable',
      'playwright-mcp',
      'ponytail',
      'security-guidance',
    ].sort(),
  );
});

test('pick-one groups are marked so the merge suggests one per group', () => {
  for (const id of ['graphify', 'understand-anything'])
    expect(item(id).groupMode).toBe('pick-one');
  for (const id of [
    'impeccable',
    'taste-skill',
    'ui-ux-pro-max',
    'frontend-design',
  ])
    expect(item(id).groupMode).toBe('pick-one');
  for (const id of ['playwright-mcp', 'chrome-devtools-mcp'])
    expect(item(id).groupMode).toBe('pick-one');
  expect(item('ponytail').groupMode).toBe('complementary');
});

test('write-capable connectors default to their safe mode', () => {
  const mcp = (id: string) => {
    const i = item(id).install;
    if (i.type !== 'mcp') throw new Error(`${id} is not an mcp item`);
    return i.entry;
  };
  expect(JSON.stringify(mcp('aws'))).toContain('"READ_OPERATIONS_ONLY":"true"');
  expect(JSON.stringify(mcp('mongodb'))).toContain('--readOnly');
  expect(JSON.stringify(mcp('mongodb'))).toContain('disabled');
  expect(JSON.stringify(mcp('linear'))).toContain('/mcp/readonly');
  expect(JSON.stringify(mcp('neon'))).toContain('readonly=true');
  expect(JSON.stringify(mcp('supabase'))).toContain('read_only=true');
  // every one of them still offers the non-safe variant as an explicit opt-in
  for (const id of ['aws', 'mongodb', 'linear', 'neon', 'supabase'])
    expect(
      item(id).variants.some((v) => !v.safe),
      id,
    ).toBe(true);
});

test('AWP only auto-runs installers for owner-verified items with documented flags', () => {
  const installers = reg.items.filter((i) => i.install.type === 'installer');
  expect(installers.map((i) => i.id).sort()).toEqual([
    'graphify',
    'impeccable',
  ]);
  for (const i of installers) expect(i.verified).toBe(true);
  // caveman edits ~/.claude/settings.json and task-observer's non-interactive mode is unverified
  expect(item('caveman').install.type).toBe('doc');
  expect(item('task-observer').install.type).toBe('doc');
});

test('plugins install from a named marketplace and never pin what Claude Code cannot', () => {
  for (const i of reg.items) {
    if (i.install.type !== 'plugin') continue;
    expect(i.install.plugin, i.id).toMatch(/^[\w.-]+@[\w.-]+$/);
    expect(i.install.ref, `${i.id} must not claim a pin`).toBeUndefined();
  }
  expect(item('security-guidance').install).toMatchObject({
    plugin: 'security-guidance@claude-plugins-official',
  });
});

test('license policy: nothing copyleft or source-available reaches the product', () => {
  const reaches = reg.items.filter((i) => i.kind === 'library');
  for (const i of reaches)
    expect(i.license, i.id).not.toMatch(/GPL|FSL|BUSL|SSPL/i);
  // tools that only act on code may be GPL/CC-BY-SA but are never bundled: ensure none is a library
  expect(item('trailofbits-skills').kind).not.toBe('library');
});

test('the GSAP guard skips visual animation builders and animejs is the alternative', () => {
  const g = item('gsap-skills').guards[0];
  expect(g.action).toBe('skip');
  expect(g.when.join(' ')).toMatch(/visual animation builder/i);
  expect(item('animejs').group).toBe(item('gsap-skills').group);
});

test('caveman never runs in interview, design or planning stages', () => {
  expect(item('caveman').neverStages).toEqual(
    expect.arrayContaining(['ideation', 'design', 'planning']),
  );
});

test('the discovery plugin is pinned to a commit, a folder and its git tree hash', () => {
  expect(item('claude-code-setup').source).toMatchObject({
    sha: 'ea10b213686c90bb1984b2016937310e05336cf3',
    path: 'plugins/claude-code-setup',
    tree: 'e99b04c69709c7e3e07a0d9cd4e7897c9dd2010b',
  });
});

test('internal items (used by AWP itself) are tagged so they are not suggested', () => {
  expect(item('claude-code-setup').tags).toContain('internal');
});

test('every pinned commit is a full SHA and every remote url is https', () => {
  for (const i of reg.items) {
    if (i.source.sha) expect(i.source.sha).toMatch(/^[0-9a-f]{40}$/);
    if (i.source.repo)
      expect(i.source.repo).toMatch(/^https:\/\/github\.com\//);
  }
});

test('items needing a secret declare it so Approve becomes Connect account', () => {
  expect(item('github-mcp').requires.env.map((e) => e.name)).toContain(
    'GITHUB_PERSONAL_ACCESS_TOKEN',
  );
  expect(item('mongodb').requires.env.map((e) => e.name)).toContain(
    'MDB_MCP_CONNECTION_STRING',
  );
  const c7 = item('context7').requires.env.find(
    (e) => e.name === 'CONTEXT7_API_KEY',
  );
  expect(c7?.optional).toBe(true);
});

test('auto-run installers are pinned to an exact version', () => {
  const commands = (id: string) => {
    const i = item(id).install;
    if (i.type !== 'installer') throw new Error(`${id} is not an installer`);
    return i.commands;
  };
  // impeccable 4.6.0 = the package.json version of the owner-verified commit; graphifyy 0.9.91 = the tag at that commit
  expect(commands('impeccable')).toEqual([
    [
      'npx',
      'impeccable@4.6.0',
      'install',
      '--providers=claude',
      '--scope=project',
    ],
  ]);
  expect(commands('graphify')).toEqual([
    ['uv', 'tool', 'install', 'graphifyy==0.9.91'],
    ['graphify', 'install', '--project'],
  ]);
  for (const i of reg.items) {
    if (i.install.type !== 'installer') continue;
    for (const c of i.install.commands) {
      if (c[0] === 'npx') expect(c[1], i.id).toMatch(/@\d+\.\d+\.\d+$/);
      if (c[0] === 'uv' && c[1] === 'tool')
        expect(c[3], i.id).toMatch(/==\d+\.\d+\.\d+$/);
    }
  }
});

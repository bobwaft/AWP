import { fixFor, setupReady } from '@awp/protocol';
import { expect, test } from 'vitest';
import {
  detectTools,
  expandWinVars,
  freshEnv,
  parseRegPath,
  type Runner,
  versionOf,
} from './setup';

const runner =
  (table: Record<string, string | null>): Runner =>
  async (cmd, args) =>
    table[`${cmd} ${args.join(' ')}`] ?? null;

const all = {
  'git --version': 'git version 2.43.0',
  'claude --version': '2.1.301 (Claude Code)',
  'claude auth status':
    '{"loggedIn":true,"email":"a@b.c","subscriptionType":"pro"}',
  'gh --version': 'gh version 2.40.0',
  'gh auth status': 'Logged in to github.com account octo (keyring)',
  'semgrep --version': '1.50.0',
};

test('all tools ready with account and plan', async () => {
  const r = await detectTools(runner(all), 'linux');
  expect(r.claude).toMatchObject({
    state: 'ready',
    version: '2.1.301',
    account: 'a@b.c',
    plan: 'pro',
  });
  expect(r.gh).toMatchObject({ state: 'ready', account: 'octo' });
  expect(setupReady(r)).toBe(true);
});

test('missing, signed-out and outdated states', async () => {
  const r = await detectTools(
    runner({
      ...all,
      'claude auth status': '{"loggedIn":false}',
      'git --version': null,
      'gh auth status': 'You are not logged in',
      'semgrep --version': null,
    }),
    'linux',
  );
  expect(r.git.state).toBe('missing');
  expect(r.claude.state).toBe('needs_signin');
  expect(r.gh.state).toBe('needs_signin');
  expect(r.semgrep.state).toBe('missing');
  expect(setupReady(r)).toBe(false);
  const old = await detectTools(
    runner({ ...all, 'claude --version': '1.0.5 (Claude Code)' }),
    'linux',
  );
  expect(old.claude.state).toBe('outdated');
});

test('garbage auth output does not crash', async () => {
  const r = await detectTools(
    runner({ ...all, 'claude auth status': 'oops' }),
    'linux',
  );
  expect(r.claude.state).toBe('needs_signin');
});

test('windows PATH comes from the registry, machine before user, vars expanded', async () => {
  const run: Runner = async (_c, a) =>
    a[1] === 'HKCU\\Environment'
      ? '\n    Path    REG_EXPAND_SZ    C:\\Users\\me\\bin;%MYDIR%\n'
      : '\n    Path    REG_SZ    C:\\Windows\n';
  process.env.MYDIR = 'C:\\mine';
  const env = await freshEnv(run, 'win32');
  expect(env.PATH?.startsWith('C:\\Windows;C:\\Users\\me\\bin;C:\\mine;')).toBe(
    true,
  );
  expect(await freshEnv(run, 'linux')).toEqual({});
});

test('helpers', () => {
  expect(versionOf('git version 2.43.0.windows.1')).toBe('2.43.0');
  expect(parseRegPath('x')).toBeUndefined();
  expect(expandWinVars('%A%\\x', { A: 'q' })).toBe('q\\x');
});

test('fix list covers each non-ready state on each OS', () => {
  for (const os of ['win32', 'darwin', 'linux'] as const) {
    expect(fixFor('claude', 'missing', os)?.command).toBeTruthy();
    expect(fixFor('claude', 'needs_signin', os)?.command).toBe('claude');
    expect(fixFor('git', 'missing', os)?.command).toBeTruthy();
  }
});

test('no protocol method can write to a terminal', async () => {
  const { methods } = await import('@awp/protocol');
  expect(Object.keys(methods).filter((m) => /pty|terminal/i.test(m))).toEqual(
    [],
  );
});

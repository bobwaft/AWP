import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { launchProgram, resolveProgram } from './resolve-program';

const dir = () => mkdtempSync(join(tmpdir(), 'awp-rp-'));
const touch = (d: string, name: string) => {
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, name), '');
};
const sep = process.platform === 'win32' ? ';' : ':';
// Windows paths are case-insensitive: PATHEXT's `.EXE` finds `tool.exe`
const same = (a: string | null, b: string) =>
  process.platform === 'win32' ? a?.toLowerCase() : a;
const want = (b: string) =>
  process.platform === 'win32' ? b.toLowerCase() : b;

test('finds a program on PATH', () => {
  const bin = dir();
  touch(bin, process.platform === 'win32' ? 'tool.exe' : 'tool');
  expect(
    same(
      resolveProgram('tool', { cwd: dir(), env: { PATH: bin, Path: bin } }),
      '',
    ),
  ).toBe(want(join(bin, process.platform === 'win32' ? 'tool.exe' : 'tool')));
});

test('a program that only exists in the project folder is never used', () => {
  const project = dir();
  const bin = dir();
  const file = process.platform === 'win32' ? 'evil.cmd' : 'evil';
  touch(project, file);
  // the project folder is even on PATH (as `.`, or by its full path)
  for (const PATH of [
    `.${sep}${bin}`,
    `${project}${sep}${bin}`,
    `${sep}${bin}`,
  ]) {
    expect(
      resolveProgram('evil', { cwd: project, env: { PATH, Path: PATH } }),
      PATH,
    ).toBeNull();
  }
});

test('a program in a subfolder of the project is not used either', () => {
  const project = dir();
  const sub = join(project, 'node_modules', '.bin');
  touch(sub, process.platform === 'win32' ? 'npx.cmd' : 'npx');
  expect(
    resolveProgram('npx', { cwd: project, env: { PATH: sub, Path: sub } }),
  ).toBeNull();
});

test('the first match on PATH outside the project wins', () => {
  const project = dir();
  const a = dir();
  const b = dir();
  const f = process.platform === 'win32' ? 'tool.exe' : 'tool';
  touch(project, f);
  touch(a, f);
  touch(b, f);
  const PATH = [project, a, b].join(sep);
  expect(
    same(
      resolveProgram('tool', { cwd: project, env: { PATH, Path: PATH } }),
      '',
    ),
  ).toBe(want(join(a, f)));
});

test('Windows: tries PATHEXT in order, and keeps an explicit extension', () => {
  const bin = dir();
  touch(bin, 'tool.cmd');
  touch(bin, 'tool.exe');
  const env = { PATH: bin, Path: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  expect(
    resolveProgram('tool', {
      cwd: dir(),
      env,
      platform: 'win32',
    })?.toLowerCase(),
  ).toBe(join(bin, 'tool.exe').toLowerCase());
  expect(
    resolveProgram('tool.cmd', {
      cwd: dir(),
      env,
      platform: 'win32',
    })?.toLowerCase(),
  ).toBe(join(bin, 'tool.cmd').toLowerCase());
});

test('names that are paths are not resolved', () => {
  expect(
    resolveProgram('./evil', { cwd: dir(), env: { PATH: dir() } }),
  ).toBeNull();
  expect(
    resolveProgram('..\\evil', { cwd: dir(), env: { PATH: dir() } }),
  ).toBeNull();
  expect(resolveProgram('', { cwd: dir(), env: { PATH: dir() } })).toBeNull();
});

test('launchProgram: the executable is found outside the project, or the launch fails; it never falls back to a bare name', () => {
  const project = dir();
  const bin = dir();
  const f = process.platform === 'win32' ? 'claude.exe' : 'claude';
  touch(project, f);
  touch(bin, f);
  const PATH = `${project}${sep}${bin}`;
  expect(
    launchProgram('claude', {
      cwd: project,
      env: { PATH, Path: PATH },
    }).toLowerCase(),
  ).toBe(join(bin, f).toLowerCase());
  const only = dir();
  touch(only, f);
  expect(() =>
    launchProgram('claude', { cwd: only, env: { PATH: only, Path: only } }),
  ).toThrow(/ENOENT/);
});

test('launchProgram: a .cmd/.bat shim cannot be started with arbitrary arguments, so it is refused', () => {
  const bin = dir();
  touch(bin, 'claude.cmd');
  expect(() =>
    launchProgram('claude', {
      cwd: dir(),
      env: { PATH: bin, Path: bin, PATHEXT: '.CMD' },
      platform: 'win32',
    }),
  ).toThrow(/ENOENT/);
});

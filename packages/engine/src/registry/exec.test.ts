import { expect, test, vi } from 'vitest';
import { EngineError } from '../errors';
import { assertSafeArgv, prepareSpawn } from './exec';

const cmdShim = () => 'C:\\Program Files\\nodejs\\npx.cmd';
const base = { cwd: 'C:\\proj', env: { PATH: 'x' } };

test('commands are argv only: parts with shell characters are refused', () => {
  for (const bad of [
    'a b',
    'a;b',
    'a&b',
    'a|b',
    '$(x)',
    '`x`',
    'a>b',
    '"x"',
    'a\nb',
    '%PATH%',
    'a^b',
    'a!b',
  ])
    expect(() => assertSafeArgv(['npx', bad]), bad).toThrow(EngineError);
  expect(() =>
    assertSafeArgv([
      'npx',
      'impeccable@4.6.0',
      'install',
      '--providers=claude',
      '--scope=project',
    ]),
  ).not.toThrow();
});

test('the program is resolved with the project folder excluded', () => {
  const resolve = vi.fn(() => 'C:\\tools\\uv.exe');
  prepareSpawn(['uv', 'tool', 'install', 'x'], {
    ...base,
    platform: 'win32',
    resolve,
  });
  expect(resolve).toHaveBeenCalledWith(
    'uv',
    expect.objectContaining({ cwd: 'C:\\proj', platform: 'win32' }),
  );
});

test('Windows: a .cmd shim runs through cmd.exe by its absolute path, quoted, with the cwd search switched off', () => {
  const p = prepareSpawn(['npx', '-y', 'x@latest'], {
    ...base,
    platform: 'win32',
    resolve: cmdShim,
  });
  expect(p.file).toBe('cmd.exe');
  expect(p.verbatim).toBe(true);
  expect(p.args).toEqual([
    '/d',
    '/s',
    '/c',
    '""C:\\Program Files\\nodejs\\npx.cmd" -y x@latest"',
  ]);
  expect(p.env.NoDefaultCurrentDirectoryInExePath).toBe('1');
});

test('Windows: a real executable is started directly by its absolute path', () => {
  const p = prepareSpawn(['uv', 'tool', 'install', 'graphifyy==0.9.91'], {
    ...base,
    platform: 'win32',
    resolve: () => 'C:\\tools\\uv.exe',
  });
  expect(p).toMatchObject({
    file: 'C:\\tools\\uv.exe',
    args: ['tool', 'install', 'graphifyy==0.9.91'],
    verbatim: false,
  });
});

test('other platforms start the resolved path directly', () => {
  expect(
    prepareSpawn(['npx', 'x'], {
      cwd: '/p',
      platform: 'linux',
      resolve: () => '/usr/bin/npx',
    }),
  ).toMatchObject({
    file: '/usr/bin/npx',
    args: ['x'],
  });
});

test('a program that is not on PATH (only in the project) is reported missing', () => {
  try {
    prepareSpawn(['claude', 'plugin', 'install', 'x@y'], {
      ...base,
      platform: 'win32',
      resolve: () => null,
    });
    throw new Error('expected a failure');
  } catch (e) {
    expect((e as NodeJS.ErrnoException).code).toBe('ENOENT');
  }
});

test('a resolved .cmd path with cmd.exe metacharacters is refused', () => {
  for (const evil of [
    'C:\\a&b\\npx.cmd',
    'C:\\a%PATH%\\npx.cmd',
    'C:\\a^b\\npx.cmd',
    'C:\\a"b\\npx.cmd',
    'C:\\a!b\\npx.cmd',
  ])
    expect(
      () =>
        prepareSpawn(['npx', 'x'], {
          ...base,
          platform: 'win32',
          resolve: () => evil,
        }),
      evil,
    ).toThrow(EngineError);
});

test('an installer cannot widen its environment beyond what is passed', () => {
  const p = prepareSpawn(['uv', 'x'], {
    ...base,
    platform: 'linux',
    resolve: () => '/u',
    extraEnv: { UV_NO_CONFIG: '1' },
  });
  expect(p.env.UV_NO_CONFIG).toBe('1');
});

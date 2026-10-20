import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { EngineError } from '../../errors';
import type { Exec } from '../exec';
import { runInstaller } from './installer';
import { writeMcpEntry } from './mcp-json';
import { installPlugin } from './plugin';

const root = () => mkdtempSync(join(tmpdir(), 'awp-w-'));
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};
const readJson = (r: string) =>
  JSON.parse(readFileSync(join(r, '.mcp.json'), 'utf8'));

// ---- .mcp.json ----

const remote = {
  type: 'http' as const,
  url: 'https://mcp.linear.app/mcp/readonly',
};
const stdio = {
  command: 'npx',
  args: ['-y', 'mongodb-mcp-server', '--readOnly'],
  env: { MDB_MCP_CONNECTION_STRING: '${MDB_MCP_CONNECTION_STRING}' },
};

test('creates .mcp.json and adds a server', async () => {
  const r = root();
  await writeMcpEntry({ root: r, name: 'linear', entry: remote });
  expect(readJson(r)).toEqual({ mcpServers: { linear: remote } });
});

test('keeps existing servers and other top-level keys', async () => {
  const r = root();
  writeFileSync(
    join(r, '.mcp.json'),
    JSON.stringify({
      extra: 1,
      mcpServers: { mine: { command: 'x', args: [] } },
    }),
  );
  await writeMcpEntry({ root: r, name: 'linear', entry: remote });
  const j = readJson(r);
  expect(j.extra).toBe(1);
  expect(Object.keys(j.mcpServers).sort()).toEqual(['linear', 'mine']);
});

test('a name that exists and AWP did not write is never overwritten', async () => {
  const r = root();
  writeFileSync(
    join(r, '.mcp.json'),
    JSON.stringify({ mcpServers: { linear: { command: 'theirs', args: [] } } }),
  );
  expect(
    await code(writeMcpEntry({ root: r, name: 'linear', entry: remote })),
  ).toBe('MCP_NAME_CLASH');
  expect(readJson(r).mcpServers.linear.command).toBe('theirs');
  // an identical entry is fine (idempotent)
  const r2 = root();
  await writeMcpEntry({ root: r2, name: 'linear', entry: remote });
  await writeMcpEntry({ root: r2, name: 'linear', entry: remote });
  // AWP's own entry can be replaced (e.g. switching to the read-write variant)
  await writeMcpEntry({
    root: r2,
    name: 'linear',
    entry: { type: 'http', url: 'https://mcp.linear.app/mcp' },
    owned: true,
  });
  expect(readJson(r2).mcpServers.linear.url).toBe('https://mcp.linear.app/mcp');
});

test('an unreadable .mcp.json is never overwritten', async () => {
  const r = root();
  writeFileSync(join(r, '.mcp.json'), '{ not json');
  expect(
    await code(writeMcpEntry({ root: r, name: 'linear', entry: remote })),
  ).toBe('MCP_JSON_INVALID');
  expect(readFileSync(join(r, '.mcp.json'), 'utf8')).toBe('{ not json');
});

test('only ${VAR} references reach the file; a known secret value never does', async () => {
  const r = root();
  await writeMcpEntry({
    root: r,
    name: 'mongodb',
    entry: stdio,
    secrets: ['mongodb://user:hunter2@host/db'],
  });
  const text = readFileSync(join(r, '.mcp.json'), 'utf8');
  expect(text).toContain('${MDB_MCP_CONNECTION_STRING}');
  expect(text).not.toContain('hunter2');
  // a literal secret in the entry is refused outright
  const leaky = {
    ...stdio,
    env: { MDB_MCP_CONNECTION_STRING: 'mongodb://user:hunter2@host/db' },
  };
  expect(await code(writeMcpEntry({ root: r, name: 'm2', entry: leaky }))).toBe(
    'MCP_ENTRY_INVALID',
  );
  // defense in depth: a secret value that sneaks into an otherwise valid entry is caught
  const sneaky = {
    type: 'http' as const,
    url: 'https://x.test/mcp?k=hunter2secret',
  };
  expect(
    await code(
      writeMcpEntry({
        root: r,
        name: 'm3',
        entry: sneaky,
        secrets: ['hunter2secret'],
      }),
    ),
  ).toBe('SECRET_IN_CONFIG');
  expect(readFileSync(join(r, '.mcp.json'), 'utf8')).not.toContain('hunter2');
});

test('server names are restricted', async () => {
  for (const name of ['', '../x', 'a b', 'a/b'])
    expect(
      await code(writeMcpEntry({ root: root(), name, entry: remote })),
      name,
    ).toBe('INVALID_ID');
});

// ---- command execution ----

// ---- plugins ----

const recorder = (
  results: Record<string, { code: number; out?: string }> = {},
) => {
  const calls: string[][] = [];
  const exec: Exec = async (argv) => {
    calls.push(argv);
    const key = argv.slice(0, 4).join(' ');
    const r = Object.entries(results).find(([k]) => key.startsWith(k))?.[1];
    return { code: r?.code ?? 0, stdout: r?.out ?? '', stderr: '' };
  };
  return { calls, exec };
};

test("a plugin is installed with the user's own claude CLI at project scope", async () => {
  const { calls, exec } = recorder();
  await installPlugin({
    root: root(),
    marketplace: 'DietrichGebert/ponytail',
    plugin: 'ponytail@ponytail',
    exec,
  });
  expect(calls).toEqual([
    [
      'claude',
      'plugin',
      'marketplace',
      'add',
      'DietrichGebert/ponytail',
      '--scope',
      'project',
    ],
    [
      'claude',
      'plugin',
      'install',
      'ponytail@ponytail',
      '--scope',
      'project',
      '-y',
    ],
  ]);
});

test('"marketplace already added" is not a failure; a real failure is reported', async () => {
  const already = recorder({
    'claude plugin marketplace add': {
      code: 1,
      out: 'Marketplace already added',
    },
  });
  await installPlugin({
    root: root(),
    marketplace: 'a/b',
    plugin: 'p@b',
    exec: already.exec,
  });
  expect(already.calls.length).toBe(2);

  const failing = recorder({
    'claude plugin install': { code: 1, out: 'Plugin not found' },
  });
  expect(
    await code(
      installPlugin({
        root: root(),
        marketplace: 'a/b',
        plugin: 'p@b',
        exec: failing.exec,
      }),
    ),
  ).toBe('PLUGIN_INSTALL_FAILED');
});

test('a missing claude CLI is reported as such', async () => {
  const exec: Exec = async () => {
    throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
  };
  expect(
    await code(
      installPlugin({ root: root(), marketplace: 'a/b', plugin: 'p@b', exec }),
    ),
  ).toBe('TOOL_MISSING');
});

test('plugin ids and marketplaces with shell characters are refused', async () => {
  const { exec } = recorder();
  expect(
    await code(
      installPlugin({
        root: root(),
        marketplace: 'a/b; rm -rf x',
        plugin: 'p@b',
        exec,
      }),
    ),
  ).toBe('UNSAFE_COMMAND');
});

// ---- installers ----

test('installers run their commands in order in the project folder', async () => {
  const { calls, exec } = recorder();
  const r = root();
  await runInstaller({
    root: r,
    commands: [
      ['uv', 'tool', 'install', 'graphifyy'],
      ['graphify', 'install', '--project'],
    ],
    exec,
  });
  expect(calls).toEqual([
    ['uv', 'tool', 'install', 'graphifyy'],
    ['graphify', 'install', '--project'],
  ]);
});

test('an installer stops at the first failing command', async () => {
  const { calls, exec } = recorder({
    'uv tool install': { code: 2, out: 'boom' },
  });
  expect(
    await code(
      runInstaller({
        root: root(),
        commands: [
          ['uv', 'tool', 'install', 'graphifyy'],
          ['graphify', 'install', '--project'],
        ],
        exec,
      }),
    ),
  ).toBe('INSTALLER_FAILED');
  expect(calls.length).toBe(1);
});

test('only allow-listed programs may run as installers', async () => {
  const { calls, exec } = recorder();
  for (const cmd of [
    ['curl', 'x'],
    ['bash', '-c', 'x'],
    ['powershell', 'x'],
    ['rm', '-rf', 'x'],
  ])
    expect(
      await code(runInstaller({ root: root(), commands: [cmd], exec })),
      cmd[0],
    ).toBe('INSTALLER_NOT_ALLOWED');
  expect(calls.length).toBe(0);
});

test('a missing tool is reported with what to install', async () => {
  const exec: Exec = async () => {
    throw Object.assign(new Error('spawn uv ENOENT'), { code: 'ENOENT' });
  };
  try {
    await runInstaller({
      root: root(),
      commands: [['uv', 'tool', 'install', 'graphifyy']],
      exec,
    });
    throw new Error('expected a failure');
  } catch (e) {
    expect((e as EngineError).code).toBe('TOOL_MISSING');
    expect((e as EngineError).message).toContain('uv');
  }
});

test('installers ignore the project npm and uv configuration', async () => {
  const seen: Record<string, string>[] = [];
  const exec: Exec = async (_argv, opts) => {
    seen.push((opts as { extraEnv?: Record<string, string> }).extraEnv ?? {});
    return { code: 0, stdout: '', stderr: '' };
  };
  await runInstaller({
    root: root(),
    commands: [
      ['npx', 'impeccable@4.6.0', 'install'],
      ['uv', 'tool', 'install', 'graphifyy==0.9.91'],
    ],
    exec,
  });
  for (const env of seen) {
    expect(env.npm_config_registry).toBe('https://registry.npmjs.org/');
    expect(env.UV_NO_CONFIG).toBe('1');
    expect(env.UV_INDEX_URL).toBe('https://pypi.org/simple');
    expect(env.npm_config_yes).toBe('true');
  }
});

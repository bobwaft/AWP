import { expect, test } from 'vitest';
import {
  INSTALL_KINDS,
  RegistryFile,
  RegistryItem,
  Suggestion,
  SuggestionsInput,
} from './registry';

const base = {
  id: 'ponytail',
  kind: 'plugin',
  name: 'Ponytail',
  summary: 'Smallest change that solves the task.',
  license: 'MIT',
  agents: ['claude'],
  stages: ['implementation'],
  tags: ['tokens'],
  group: 'G3',
  groupMode: 'complementary',
  source: {
    repo: 'https://github.com/DietrichGebert/ponytail',
    sha: '84740e3d344b69b4a133201fa519eb37a62a2b2a',
  },
  install: {
    type: 'plugin',
    marketplace: 'DietrichGebert/ponytail',
    plugin: 'ponytail@ponytail',
  },
};

test('a plugin item parses and gets defaults', () => {
  const r = RegistryItem.parse(base);
  expect(r.verified).toBe(true);
  expect(r.requires.env).toEqual([]);
  expect(r.flags.telemetry).toBe(false);
  expect(r.default).toBe(false);
});

test('a pinned commit must be a full 40-char SHA', () => {
  const bad = { ...base, source: { ...base.source, sha: '84740e3d' } };
  expect(RegistryItem.safeParse(bad).success).toBe(false);
});

test('a skill-copy item needs path and tree', () => {
  const skill = {
    ...base,
    id: 'awp-interview',
    kind: 'skill',
    install: { type: 'skill' },
    source: { ...base.source, path: 'skills/awp-interview' },
  };
  expect(RegistryItem.safeParse(skill).success).toBe(false); // no tree
  const ok = {
    ...skill,
    source: { ...skill.source, tree: 'a'.repeat(40) },
  };
  expect(RegistryItem.safeParse(ok).success).toBe(true);
});

test('mcp entries are stdio or http; secrets must be ${VAR} refs, never literals', () => {
  const mcp = (entry: unknown) => ({
    ...base,
    id: 'context7',
    kind: 'mcp',
    install: { type: 'mcp', entry },
  });
  expect(
    RegistryItem.safeParse(
      mcp({ type: 'http', url: 'https://mcp.context7.com/mcp' }),
    ).success,
  ).toBe(true);
  expect(
    RegistryItem.safeParse(
      mcp({ command: 'npx', args: ['-y', 'x'], env: { K: '${K}' } }),
    ).success,
  ).toBe(true);
  // a literal token in a header or env value is refused
  expect(
    RegistryItem.safeParse(
      mcp({
        type: 'http',
        url: 'https://x.test/mcp',
        headers: { Authorization: 'Bearer sk-live-123' },
      }),
    ).success,
  ).toBe(false);
  expect(
    RegistryItem.safeParse(mcp({ command: 'x', env: { API_KEY: 'abc' } }))
      .success,
  ).toBe(false);
});

test('stdio env: plain literals only for non-secret flags', () => {
  const mcp = (env: unknown) => ({
    ...base,
    id: 'aws',
    kind: 'mcp',
    install: { type: 'mcp', entry: { command: 'uvx', args: ['x'], env } },
  });
  expect(
    RegistryItem.safeParse(
      mcp({ READ_OPERATIONS_ONLY: 'true', AWS_REGION: 'us-east-1' }),
    ).success,
  ).toBe(true);
  expect(
    RegistryItem.safeParse(
      mcp({ MDB_MCP_CONNECTION_STRING: 'mongodb://u:p@h' }),
    ).success,
  ).toBe(false);
  expect(
    RegistryItem.safeParse(
      mcp({ MDB_MCP_CONNECTION_STRING: '${MDB_MCP_CONNECTION_STRING}' }),
    ).success,
  ).toBe(true);
});

test('remote entries must be https', () => {
  const r = RegistryItem.safeParse({
    ...base,
    id: 'x',
    kind: 'connector',
    install: { type: 'mcp', entry: { type: 'http', url: 'http://x.test/mcp' } },
  });
  expect(r.success).toBe(false);
});

test('an installer item keeps its command as argv, not a shell string', () => {
  const inst = (commands: unknown) => ({
    ...base,
    id: 'impeccable',
    kind: 'tool',
    install: { type: 'installer', commands },
  });
  expect(
    RegistryItem.safeParse(inst([['npx', 'impeccable', 'install']])).success,
  ).toBe(true);
  expect(RegistryItem.safeParse(inst(['npx impeccable install'])).success).toBe(
    false,
  );
});

test('the registry file rejects duplicate ids and unknown install kinds', () => {
  const file = { version: 1, items: [base, base] };
  expect(RegistryFile.safeParse(file).success).toBe(false);
  expect(INSTALL_KINDS).toContain('installer');
  expect(RegistryFile.safeParse({ version: 1, items: [base] }).success).toBe(
    true,
  );
});

test('a variant replaces the install template and may be marked safe', () => {
  const r = RegistryItem.parse({
    ...base,
    id: 'linear',
    kind: 'connector',
    install: {
      type: 'mcp',
      entry: { type: 'http', url: 'https://mcp.linear.app/mcp/readonly' },
    },
    variants: [
      {
        id: 'write',
        label: 'Read and write',
        install: {
          type: 'mcp',
          entry: { type: 'http', url: 'https://mcp.linear.app/mcp' },
        },
      },
    ],
  });
  expect(r.variants[0].safe).toBe(false);
});

test('suggestions: registry id or recommender item, with a reason', () => {
  expect(
    SuggestionsInput.safeParse({
      suggestions: [{ id: 'context7', why: 'Uses third-party libraries.' }],
    }).success,
  ).toBe(true);
  expect(
    SuggestionsInput.safeParse({
      suggestions: [
        {
          name: 'Some tool',
          kind: 'mcp',
          repoUrl: 'https://github.com/a/b',
          category: 'MCP Servers',
          why: 'Fits the stack.',
        },
      ],
    }).success,
  ).toBe(true);
  // neither an id nor a name
  expect(
    SuggestionsInput.safeParse({ suggestions: [{ why: 'x' }] }).success,
  ).toBe(false);
  // no reason
  expect(
    SuggestionsInput.safeParse({ suggestions: [{ id: 'context7' }] }).success,
  ).toBe(false);
});

test('a stored suggestion records its status and source', () => {
  const s = Suggestion.parse({
    id: 'context7',
    repoKey: 'github.com/upstash/context7',
    source: 'registry',
    verified: true,
    status: 'suggested',
    reason: 'Uses third-party libraries.',
    at: '2026-10-19T00:00:00.000Z',
  });
  expect(s.status).toBe('suggested');
});

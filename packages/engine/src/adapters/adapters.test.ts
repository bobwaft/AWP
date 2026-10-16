import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentEvent, type AgentEvent as Ev } from '@awp/protocol';
import { expect, test } from 'vitest';
import { RunManager } from '../runs';
import { buildArgs, isSupportedVersion } from './claude';
import { createClaudeParser } from './claude-parse';
import { FakeAdapter, FIXTURE_DIR } from './fake';

const parseFixture = (name: string) => {
  const parse = createClaudeParser();
  return readFileSync(join(FIXTURE_DIR, `${name}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap(parse);
};
const types = (evs: Ev[]) => evs.map((e) => e.type);

test('golden: text-only transcript', () => {
  const evs = parseFixture('claude-text-only');
  expect(types(evs)).toEqual(['session', 'message', 'usage', 'done']);
  expect(evs[1]).toMatchObject({ text: 'pong' });
  expect(evs.at(-1)).toEqual({ type: 'done', status: 'success' });
});

test('golden: list-files transcript has command + tool pairing', () => {
  const evs = parseFixture('claude-list-files');
  expect(types(evs)).toEqual([
    'session',
    'tool_call',
    'command',
    'tool_result',
    'message',
    'usage',
    'done',
  ]);
  expect(evs[2]).toMatchObject({ cmd: expect.stringContaining('ls') });
});

test('golden: write transcript has a denied tool and one file_change', () => {
  const evs = parseFixture('claude-write-file');
  expect(evs.filter((e) => e.type === 'tool_result' && !e.ok)).toHaveLength(1);
  const changes = evs.filter((e) => e.type === 'file_change');
  expect(changes).toEqual([
    { type: 'file_change', path: '/work/project/hello.txt', kind: 'add' },
  ]);
});

test('every parsed event satisfies the protocol schema', () => {
  for (const f of [
    'claude-text-only',
    'claude-list-files',
    'claude-write-file',
  ])
    for (const e of parseFixture(f))
      expect(AgentEvent.safeParse(e).success).toBe(true);
});

test('parser ignores garbage lines', () => {
  expect(createClaudeParser()('not json')).toEqual([]);
});

test('buildArgs puts prompt after -- and includes options', () => {
  const a = buildArgs(
    {
      runId: 'r',
      cwd: '/x',
      prompt: '--evil',
      model: 'haiku',
      allowedTools: ['Read'],
      maxTurns: 3,
    },
    'sess',
  );
  expect(a.slice(-2)).toEqual(['--', '--evil']);
  expect(a).toEqual(
    expect.arrayContaining([
      '--resume',
      'sess',
      '--model',
      'haiku',
      '--max-turns',
      '3',
    ]),
  );
});

test('version range', () => {
  expect(isSupportedVersion('2.1.301')).toBe(true);
  expect(isSupportedVersion('3.0.0')).toBe(false);
});

test('FakeAdapter replays through RunManager and stop ends the run', async () => {
  const got: { method: string; params: { event: Ev } }[] = [];
  const mgr = new RunManager(
    (method, params) => got.push({ method, params: params as { event: Ev } }),
    () => new FakeAdapter({ fixture: 'claude-write-file', delayMs: 20 }),
  );
  const id = mgr.start({ adapter: 'fake', cwd: '/x', prompt: 'p' });
  await new Promise((r) => setTimeout(r, 50));
  await mgr.stop(id);
  await new Promise((r) => setTimeout(r, 100));
  const last = got.at(-1)?.params.event;
  expect(last).toEqual({ type: 'done', status: 'stopped' });
  expect(got.length).toBeLessThan(10);
});

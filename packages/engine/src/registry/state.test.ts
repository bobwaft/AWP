import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { rejectedFrom, SuggestionStore } from './state';

const root = () => mkdtempSync(join(tmpdir(), 'awp-s-'));
const row = (id: string, status = 'suggested', repoKey?: string) => ({
  id,
  repoKey,
  source: 'registry' as const,
  verified: true,
  idea: false,
  alternatives: [],
  status: status as 'suggested',
  reason: 'r',
  at: '2026-10-19T00:00:00.000Z',
});

test('a missing file gives an idle, empty state', async () => {
  const s = new SuggestionStore(root());
  expect(await s.load()).toEqual({ discovery: { status: 'idle' }, items: [] });
});

test('changes persist to .awp/suggestions.json and reload', async () => {
  const r = root();
  const s = new SuggestionStore(r);
  await s.mutate((st) => {
    st.items.push(row('context7'));
    st.discovery = { status: 'done', source: 'tool', at: 'x' };
  });
  expect(existsSync(join(r, '.awp', 'suggestions.json'))).toBe(true);
  const again = await new SuggestionStore(r).load();
  expect(again.items.map((i) => i.id)).toEqual(['context7']);
  expect(again.discovery.source).toBe('tool');
});

test('concurrent mutations are serialized: no lost updates', async () => {
  const s = new SuggestionStore(root());
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      s.mutate((st) => {
        st.items.push(row(`item-${i}`));
      }),
    ),
  );
  expect((await s.load()).items.length).toBe(25);
});

test('a throwing mutation changes nothing', async () => {
  const s = new SuggestionStore(root());
  await s.mutate((st) => st.items.push(row('a')));
  await expect(
    s.mutate((st) => {
      st.items.push(row('b'));
      throw new Error('nope');
    }),
  ).rejects.toThrow('nope');
  expect((await s.load()).items.map((i) => i.id)).toEqual(['a']);
});

test('a corrupt file is kept aside and replaced by an empty state', async () => {
  const r = root();
  const s = new SuggestionStore(r);
  await s.mutate((st) => st.items.push(row('a')));
  writeFileSync(join(r, '.awp', 'suggestions.json'), '{ not json');
  const fresh = new SuggestionStore(r);
  expect((await fresh.load()).items).toEqual([]);
  expect(
    readFileSync(join(r, '.awp', 'suggestions.json.corrupt'), 'utf8'),
  ).toBe('{ not json');
});

test('rows that fail the schema are dropped, the rest survive', async () => {
  const r = root();
  const s = new SuggestionStore(r);
  await s.mutate((st) => st.items.push(row('good')));
  const raw = JSON.parse(
    readFileSync(join(r, '.awp', 'suggestions.json'), 'utf8'),
  );
  raw.items.push({ id: 'bad' });
  writeFileSync(join(r, '.awp', 'suggestions.json'), JSON.stringify(raw));
  expect((await new SuggestionStore(r).load()).items.map((i) => i.id)).toEqual([
    'good',
  ]);
});

test('rejected ids and repos are collected for the matcher', () => {
  const r = rejectedFrom([
    row('stripe', 'rejected'),
    row('context7', 'suggested', 'github.com/upstash/context7'),
    row('acme', 'rejected', 'github.com/acme/maps'),
  ]);
  expect([...r.ids].sort()).toEqual(['acme', 'stripe']);
  expect([...r.repoKeys]).toEqual(['github.com/acme/maps']);
});

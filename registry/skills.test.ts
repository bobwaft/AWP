import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { RegistryFile } from '../packages/protocol/src/registry';
import { BUNDLED_SKILLS } from './skills/index';

const reg = RegistryFile.parse(
  JSON.parse(readFileSync(join(__dirname, 'registry.json'), 'utf8')),
);
const IDS = [
  'awp-interview',
  'awp-phase-runner',
  'awp-test-checklist',
  'awp-security-review',
];

test('the four AWP-native skills ship with AWP', () => {
  expect(Object.keys(BUNDLED_SKILLS).sort()).toEqual([...IDS].sort());
});

test('each is a valid Claude skill: front matter name matches its folder, with a description', () => {
  for (const id of IDS) {
    const md = BUNDLED_SKILLS[id]['SKILL.md'];
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? '';
    expect(fm, id).toMatch(new RegExp(`^name:\\s*${id}\\s*$`, 'm'));
    expect(fm, id).toMatch(/^description:\s*\S.{20,}/m);
    expect(md.length, id).toBeGreaterThan(400);
  }
});

test('bundled skills hold only markdown: no scripts, hooks or tool permissions', () => {
  for (const [id, files] of Object.entries(BUNDLED_SKILLS)) {
    for (const [path, body] of Object.entries(files)) {
      expect(path, `${id}/${path}`).toMatch(/\.md$/);
      expect(body, `${id}/${path}`).not.toMatch(/^(allowed-tools|hooks)\s*:/m);
      expect(body.startsWith('#!')).toBe(false);
    }
  }
});

test('they are registry items installed from the bundle, verified, not default, offered to every AWP project', () => {
  for (const id of IDS) {
    const item = reg.items.find((i) => i.id === id);
    expect(item, id).toBeDefined();
    expect(item?.install.type).toBe('bundled');
    expect(item?.verified).toBe(true);
    expect(item?.default).toBe(false);
    expect(item?.tags).toContain('awp-native');
    expect(item?.license).toBe('MIT');
  }
});

test('they follow AWP conventions rather than generic advice', () => {
  const all = Object.values(BUNDLED_SKILLS)
    .map((f) => f['SKILL.md'])
    .join('\n');
  for (const word of [
    'BUGS.md',
    'PHASES.md',
    'You test',
    'ask_user',
    'ARCHITECTURE.md',
  ])
    expect(all).toContain(word);
});

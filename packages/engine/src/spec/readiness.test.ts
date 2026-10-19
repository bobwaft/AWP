import { SECTION_SCHEMAS } from '@awp/prompts';
import { expect, test } from 'vitest';
import { hashSections, scoreReadiness } from './readiness';

const schema = SECTION_SCHEMAS.prd;
const req = schema.sections.filter((s) => s.required);
const doc = (filled: string[]) =>
  schema.sections
    .map((s) => `## ${s.title}\n${filled.includes(s.id) ? 'Some text.' : ''}\n`)
    .join('\n');

test('without a critique: empty sections score 0, filled 100, averaged over required ones', () => {
  expect(scoreReadiness(schema, '')).toBe(0);
  expect(scoreReadiness(schema, doc(req.map((s) => s.id)))).toBe(100);
  expect(scoreReadiness(schema, doc(['problem']))).toBe(
    Math.round(100 / req.length),
  );
});

test('an unchanged critic-scored section keeps the critic score; an edited one is rescored', () => {
  const text = doc(['problem', 'users']);
  const readiness = { problem: 40, users: 40 };
  const hashes = hashSections(schema, text);
  const only = (s: string) => scoreReadiness(schema, s, { readiness, hashes });
  const base = only(text);
  expect(base).toBe(Math.round(80 / req.length));
  // edit "problem": it leaves the critic's score and becomes 100
  const edited = text.replace('Some text.', 'Rewritten.');
  expect(only(edited)).toBe(Math.round(140 / req.length));
  // emptying it drops to 0
  expect(only(doc(['users']))).toBe(Math.round(40 / req.length));
});

test('headings match by title at any level, ignoring parentheticals; subsections count as body', () => {
  const planning = SECTION_SCHEMAS.planning;
  const text = '# Overview\n### Sub\nx\n\n# Phase plan\nsee PHASES\n';
  const h = hashSections(planning, text);
  expect(h.overview).not.toBe(hashSections(planning, '')['overview']);
  expect(scoreReadiness(planning, text)).toBe(Math.round(200 / 4));
});

import { expect, test } from 'vitest';
import {
  FORM_TEMPLATES,
  loadPrompt,
  name,
  parsePrompt,
  promptIds,
  render,
  SECTION_SCHEMAS,
} from './index';

test('exports name', () => expect(name).toBe('@awp/prompts'));

test('every library prompt parses and has its variables renderable', () => {
  for (const id of promptIds()) {
    const p = loadPrompt(id);
    expect(p.id).toBe(id);
    expect(p.version).toBeGreaterThan(0);
    const vars = Object.fromEntries(
      [...p.body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => [m[1], 'x']),
    );
    expect(() => render(p.body, vars)).not.toThrow();
  }
});

test('front matter parsing and required keys', () => {
  const p = parsePrompt(
    '---\nid: a.b\nversion: 2\ntaskType: t\nrequiredTools: x, y\n---\nHello {{n}}',
  );
  expect(p).toMatchObject({
    id: 'a.b',
    version: 2,
    taskType: 't',
    requiredTools: ['x', 'y'],
    body: 'Hello {{n}}',
  });
  expect(() => parsePrompt('no front matter')).toThrow();
  expect(() => parsePrompt('---\nid: a\n---\nbody')).toThrow(/version/);
});

test('render throws on unknown variables', () => {
  expect(render('a {{x}} b', { x: '1' })).toBe('a 1 b');
  expect(() => render('{{nope}}', {})).toThrow(/nope/);
});

test('per-project override takes precedence', () => {
  const o =
    '---\nid: ideation.interviewer\nversion: 9\ntaskType: interview\n---\ncustom';
  expect(loadPrompt('ideation.interviewer', o).body).toBe('custom');
});

test('form templates and PRD schema are consistent', () => {
  expect(Object.keys(FORM_TEMPLATES).sort()).toEqual([
    'bug_report',
    'design_schema',
    'feature_spec',
    'stack_constraints',
  ]);
  const sections = new Set([
    ...SECTION_SCHEMAS.prd.sections.map((s) => `prd.${s.id}`),
    ...SECTION_SCHEMAS.design.sections.map((s) => `design.${s.id}`),
    ...SECTION_SCHEMAS.planning.sections.map((s) => `planning.${s.id}`),
  ]);
  for (const t of Object.values(FORM_TEMPLATES))
    for (const f of t.fields as { fills?: string }[])
      if (f.fills) expect(sections.has(f.fills), f.fills).toBe(true);
});

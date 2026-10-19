import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseRecommendations } from './recommender-parse';

// Real output of the claude-code-setup recommender (headless run, 2026-10-19).
const sample = readFileSync(
  join(__dirname, '../../test/fixtures/recommender-sample.md'),
  'utf8',
);

test('parses the real recommender output into categorized items', () => {
  const items = parseRecommendations(sample);
  expect(items.map((i) => [i.kind, i.name])).toEqual([
    ['mcp', 'Supabase MCP'],
    ['mcp', 'context7'],
    ['skill', 'stripe-checkout-flow'],
    ['hook', 'Block edits to secret and env files'],
    [
      'hook',
      'Auto-format and type-check on edit (once `src/` and `tsconfig.json` exist)',
    ],
    ['subagent', 'security-reviewer'],
  ]);
});

test('keeps why, install and create lines', () => {
  const items = parseRecommendations(sample);
  const c7 = items.find((i) => i.name === 'context7');
  expect(c7?.why).toContain('fast-moving libraries');
  expect(c7?.install).toBe('claude mcp add context7');
  const skill = items.find((i) => i.name === 'stripe-checkout-flow');
  expect(skill?.create).toContain(
    '.claude/skills/stripe-checkout-flow/SKILL.md',
  );
  // fenced code blocks and the profile bullets are not items
  expect(items.some((i) => i.name.includes('Codebase'))).toBe(false);
});

test('finds a repository URL in the item text', () => {
  const md = [
    '## Claude Code Automation Recommendations',
    '### 🔌 MCP Servers',
    '#### Some Server',
    '**Why**: It helps.',
    '**Install**: `npx some-server` (https://github.com/acme/some-server)',
  ].join('\n');
  const [i] = parseRecommendations(md);
  expect(i.repoUrl).toBe('https://github.com/acme/some-server');
  expect(i.kind).toBe('mcp');
});

test('plugins, commands and unknown categories are recognised or kept as other', () => {
  const md = [
    '### 🧩 Plugins',
    '#### a-plugin',
    '**Why**: x',
    '### Slash Commands',
    '#### /deploy',
    '**Why**: y',
    '### Totally New Section',
    '#### thing',
    '**Why**: z',
  ].join('\n');
  expect(parseRecommendations(md).map((i) => i.kind)).toEqual([
    'plugin',
    'command',
    'other',
  ]);
});

test('an item without a why still parses; garbage and empty input give nothing', () => {
  const [i] = parseRecommendations('### MCP Servers\n#### lonely\n');
  expect(i).toMatchObject({ name: 'lonely', why: '' });
  expect(parseRecommendations('')).toEqual([]);
  expect(parseRecommendations('no headings here, just prose')).toEqual([]);
  expect(parseRecommendations('#### orphan item without a category')).toEqual(
    [],
  );
});

test('the closing "Want more?" text is not part of the last item', () => {
  const items = parseRecommendations(sample);
  const last = items[items.length - 1];
  expect(last.why).not.toContain('Want more');
});

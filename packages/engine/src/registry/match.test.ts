import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegistryFile } from '@awp/protocol';
import { expect, test } from 'vitest';
import { licenseStatus } from './license';
import { bundledRegistry } from './load';
import { repoKey, suggest } from './match';
import { parseRecommendations } from './recommender-parse';

const reg = bundledRegistry();
const none = { ids: new Set<string>(), repoKeys: new Set<string>() };
const WEB_SPECS = {
  prd: 'A small web app for todo lists. Users sign in and upgrade through Stripe checkout. React and Vite.',
  design: 'A clean landing page.',
  architecture:
    'React 19 + Vite frontend, Supabase for auth and Postgres, deployed on Vercel.',
};
const ids = (c: { id: string }[]) => c.map((x) => x.id);

const run = (
  specs = WEB_SPECS,
  recommender = [] as ReturnType<typeof parseRecommendations>,
  rejected = none,
) => suggest({ registry: reg, specs, recommender, rejected });

test('repoKey normalises host/owner/repo', () => {
  expect(repoKey('https://github.com/Upstash/Context7.git')).toBe(
    'github.com/upstash/context7',
  );
  expect(repoKey('https://github.com/a/b/')).toBe('github.com/a/b');
  expect(repoKey('not a url')).toBeUndefined();
});

test('defaults are pre-checked; web-only defaults need a web signal', () => {
  const web = run();
  for (const id of [
    'graphify',
    'context7',
    'ponytail',
    'impeccable',
    'security-guidance',
    'playwright-mcp',
  ])
    expect(ids(web), id).toContain(id);
  expect(web.find((c) => c.id === 'ponytail')?.preChecked).toBe(true);

  const cli = run({
    prd: 'A command line tool that renames files.',
    design: '',
    architecture: 'Rust, no UI.',
  });
  expect(ids(cli)).not.toContain('playwright-mcp');
  expect(ids(cli)).toContain('graphify');
});

test('service connectors are suggested only when the specs mention the service', () => {
  const c = run();
  for (const id of ['stripe', 'supabase', 'vercel'])
    expect(ids(c), id).toContain(id);
  for (const id of ['aws', 'neon', 'mongodb', 'firebase', 'sentry', 'linear'])
    expect(ids(c), id).not.toContain(id);
  expect(c.find((x) => x.id === 'stripe')?.reason).toMatch(/stripe/i);
  expect(c.find((x) => x.id === 'stripe')?.preChecked).toBe(false);
});

test('at most one item per pick-one group; the rest are alternatives', () => {
  const c = run();
  const g1 = c.filter((x) => x.item.group === 'G1');
  expect(ids(g1)).toEqual(['graphify']);
  expect(g1[0].alternatives).toContain('understand-anything');
  const g5 = c.filter((x) => x.item.group === 'G5');
  expect(g5.length).toBe(1);
  expect(g5[0].id).toBe('impeccable');
  expect(g5[0].alternatives).toEqual(
    expect.arrayContaining(['taste-skill', 'ui-ux-pro-max', 'frontend-design']),
  );
});

test('complementary groups can contribute several items', () => {
  const c = run({
    ...WEB_SPECS,
    design: 'Smooth scroll and animation with gsap on the landing page.',
  });
  expect(ids(c)).toEqual(expect.arrayContaining(['gsap-skills', 'lenis']));
});

test('the GSAP guard skips visual animation builders and anime.js takes its place', () => {
  const c = run({
    prd: 'A no-code visual animation builder for designers.',
    design: 'Motion everywhere.',
    architecture: 'React.',
  });
  expect(ids(c)).not.toContain('gsap-skills');
  expect(ids(c)).toContain('animejs');
});

test('internal items and rejected items are never suggested; rejection matches by repo too', () => {
  expect(ids(run())).not.toContain('claude-code-setup');
  const r = run(WEB_SPECS, [], {
    ids: new Set(['stripe']),
    repoKeys: new Set(['github.com/upstash/context7']),
  });
  expect(ids(r)).not.toContain('stripe');
  expect(ids(r)).not.toContain('context7');
});

test('a recommender mention of a registry item makes it the verified registry item, with its why', () => {
  const rec = parseRecommendations(
    readFileSync(
      join(__dirname, '../../test/fixtures/recommender-sample.md'),
      'utf8',
    ),
  );
  const c = run(WEB_SPECS, rec);
  const sb = c.find((x) => x.id === 'supabase');
  expect(sb?.verified).toBe(true);
  expect(sb?.source).toBe('registry');
  expect(sb?.reason).toMatch(/Supabase/);
  // no duplicate for the same thing
  expect(c.filter((x) => x.id === 'supabase').length).toBe(1);
  expect(c.filter((x) => x.id === 'context7').length).toBe(1);
});

test('recommender-only items are unverified; hooks, subagents and skills to write are ideas', () => {
  const rec = parseRecommendations(
    readFileSync(
      join(__dirname, '../../test/fixtures/recommender-sample.md'),
      'utf8',
    ),
  );
  const c = run(WEB_SPECS, rec);
  const skill = c.find((x) => x.id === 'stripe-checkout-flow');
  expect(skill).toMatchObject({
    source: 'recommender',
    verified: false,
    idea: true,
  });
  // a "Stripe ..." skill idea must not be mistaken for the Stripe connector
  expect(c.find((x) => x.id === 'stripe')?.source).toBe('registry');
  const sub = c.find((x) => x.id === 'security-reviewer');
  expect(sub).toMatchObject({ verified: false, idea: true });
  for (const x of c.filter((y) => y.source === 'recommender')) {
    expect(x.preChecked).toBe(false);
    expect(x.item.install.type).toBe('doc'); // AWP never runs recommender text
  }
});

test('a recommender-only MCP with a repo url keeps its repo and is not an idea', () => {
  const c = run(WEB_SPECS, [
    {
      name: 'Acme Maps',
      kind: 'mcp',
      category: 'MCP Servers',
      why: 'Maps.',
      install: 'claude mcp add acme',
      repoUrl: 'https://github.com/acme/maps-mcp',
    },
  ]);
  const a = c.find((x) => x.id === 'acme-maps');
  expect(a?.item.source.repo).toBe('https://github.com/acme/maps-mcp');
  expect(a?.idea).toBe(false);
  expect(a?.verified).toBe(false);
});

test('a rejected recommender item is not suggested again', () => {
  const rec = [
    {
      name: 'Acme Maps',
      kind: 'mcp' as const,
      category: 'MCP Servers',
      why: 'Maps.',
    },
  ];
  const c = run(WEB_SPECS, rec, {
    ids: new Set(['acme-maps']),
    repoKeys: new Set(),
  });
  expect(ids(c)).not.toContain('acme-maps');
});

test('license policy: copyleft or source-available code in the product is blocked unless owner-verified', () => {
  const lib = (license: string, verified = false) =>
    RegistryFile.parse({
      version: 1,
      items: [
        {
          id: 'x',
          kind: 'library',
          name: 'X',
          summary: 's',
          license,
          verified,
          source: {},
          install: { type: 'doc' },
        },
      ],
    }).items[0];
  expect(licenseStatus(lib('MIT')).status).toBe('ok');
  expect(licenseStatus(lib('Apache-2.0')).status).toBe('ok');
  for (const l of [
    'GPL-3.0',
    'AGPL-3.0',
    'SSPL-1.0',
    'BUSL-1.1',
    'FSL-1.1-MIT',
    'MIT + Commons Clause',
  ])
    expect(licenseStatus(lib(l)).status, l).toBe('blocked');
  // react-bits style: owner reviewed and accepted
  expect(licenseStatus(lib('MIT + Commons Clause', true)).status).toBe('ok');
  expect(licenseStatus(lib('unknown')).status).toBe('review');
  // tools that only act on the code may carry any license
  const tool = RegistryFile.parse({
    version: 1,
    items: [
      {
        id: 't',
        kind: 'tool',
        name: 'T',
        summary: 's',
        license: 'GPL-3.0',
        verified: false,
        source: {},
        install: { type: 'doc' },
      },
    ],
  }).items[0];
  expect(licenseStatus(tool).status).toBe('review');
});

test('AWP-native skills are always offered but never pre-checked, even for an unrelated project', () => {
  const c = run({
    prd: 'A command line tool that renames files.',
    design: '',
    architecture: 'Rust.',
  });
  for (const id of [
    'awp-interview',
    'awp-phase-runner',
    'awp-test-checklist',
    'awp-security-review',
  ]) {
    const x = c.find((y) => y.id === id);
    expect(x, id).toBeDefined();
    expect(x?.preChecked).toBe(false);
    expect(x?.verified).toBe(true);
    expect(x?.reason).toMatch(/AWP/);
  }
});

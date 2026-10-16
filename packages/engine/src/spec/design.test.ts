// biome-ignore-all lint/correctness/useYield: test scripts only call tools; the adapter wrapper yields events
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  contrastFailures,
  contrastRatio,
  type RunRequest,
  type SpecSnapshot,
  type Theme,
} from '@awp/protocol';
import { afterEach, expect, test } from 'vitest';
import { FakeAdapter } from '../adapters/fake';
import { createHandlers } from '../handlers';
import { mcpLauncher, startBridge } from './bridge';
import {
  addRef,
  formValuesFromTokens,
  renderDesignMd,
  tokensFromFormValues,
} from './design';
import type { SpecService } from './service';

const tokens = (
  o: Partial<Theme['tokens']['colors']> = {},
): Theme['tokens'] => ({
  colors: {
    bg: '#FFFFFF',
    surface: '#F4F4F5',
    text: '#111111',
    textMuted: '#555555',
    accent: '#0B5FFF',
    onAccent: '#FFFFFF',
    line: '#D4D4D8',
    success: '#15803D',
    warning: '#92400E',
    danger: '#B91C1C',
    ...o,
  },
  fonts: {
    sans: 'Inter, system-ui, sans-serif',
    mono: 'ui-monospace, monospace',
  },
  radius: 8,
  spacing: 4,
  density: 'comfortable',
  motion: 'subtle',
});
const theme = (
  id: string,
  o: Partial<Theme['tokens']['colors']> = {},
): Theme => ({
  id,
  name: id.toUpperCase(),
  description: `${id} theme`,
  tokens: tokens(o),
});

let dir: string;
let notes: { m: string; p: any }[];
let h: ReturnType<typeof createHandlers>;
let svc: SpecService;
const seen: Record<string, string[]> = {
  interviewer: [],
  themer: [],
  critic: [],
};

type Phase = 'interviewer' | 'themer' | 'critic';
const phaseOf = (r: RunRequest): Phase =>
  r.allowedTools?.includes('mcp__awp__submit_themes')
    ? 'themer'
    : r.allowedTools?.includes('mcp__awp__submit_critique')
      ? 'critic'
      : 'interviewer';

async function setup(
  script: (req: RunRequest, phase: Phase) => AsyncGenerator<never>,
) {
  dir = await mkdtemp(join(tmpdir(), 'awp-design-'));
  notes = [];
  for (const k of Object.keys(seen)) seen[k] = [];
  h = createHandlers(
    (m, p) => notes.push({ m, p }),
    () =>
      new FakeAdapter({
        script: async function* (req) {
          const ph = phaseOf(req);
          seen[ph].push(req.prompt);
          yield { type: 'session', sessionId: 's' };
          yield* script(req, ph);
          yield { type: 'done', status: 'success' };
        },
      }),
    { specAdapter: 'fake', withMcp: false },
  );
  await h._projects.create(join(dir, 'p'), 'p');
  svc = await h._spec();
}
const call = (n: string, p?: unknown) => (h as any)[n](p);
const snap = (): Promise<SpecSnapshot> => call('spec.get', { stage: 'design' });
const idle = async () => {
  for (let i = 0; i < 300; i++) {
    const s = await snap();
    if (!s.busy) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('busy');
};
const waitFor = async <T>(f: () => T | undefined | false) => {
  for (let i = 0; i < 300; i++) {
    const v = f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timeout');
};
const proposing: Parameters<typeof setup>[0] = async function* (req, ph) {
  if (ph === 'themer')
    await svc.callTool(req.runId, 'submit_themes', {
      themes: [
        theme('daylight'),
        theme('night', {
          bg: '#0B0D0F',
          surface: '#1A1E23',
          text: '#E8EAED',
          textMuted: '#A3ABB5',
          accent: '#FF6B1A',
          onAccent: '#0B0D0F',
        }),
      ],
    });
  if (ph === 'critic')
    await svc.callTool(req.runId, 'submit_critique', {
      questions: [],
      readiness: { overview: 90, color: 90 },
    });
};
afterEach(() => h?._projects.close());

test('contrast helper and AA failures', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  expect(contrastFailures(tokens())).toEqual([]);
  expect(contrastFailures(tokens({ text: '#CCCCCC' }))[0]).toContain(
    'text on background',
  );
});

test('refs: copies files into docs/design/refs, rejects bad types, stores links and flags Figma', async () => {
  await setup(proposing);
  const root = join(dir, 'p');
  const img = join(dir, 'Mood Board.png');
  await writeFile(img, 'fakepng');
  let refs = await call('design.addRef', { source: img });
  expect(refs.files[0]).toEqual({
    name: 'Mood-Board.png',
    path: 'docs/design/refs/Mood-Board.png',
  });
  expect(existsSync(join(root, 'docs/design/refs/Mood-Board.png'))).toBe(true);
  refs = await call('design.addRef', { source: img });
  expect(refs.files.map((f: any) => f.name)).toEqual([
    'Mood-Board.png',
    'Mood-Board-2.png',
  ]);
  refs = await call('design.addRef', {
    source: 'https://www.figma.com/design/abc/File',
  });
  await call('design.addRef', { source: 'https://example.com/inspo' });
  expect((await call('design.refs')).links).toEqual([
    { url: 'https://www.figma.com/design/abc/File', kind: 'figma' },
    { url: 'https://example.com/inspo', kind: 'url' },
  ]);
  const exe = join(dir, 'run.exe');
  await writeFile(exe, 'x');
  await expect(call('design.addRef', { source: exe })).rejects.toMatchObject({
    code: 'REF_TYPE',
  });
  await expect(
    call('design.addRef', { source: join(dir, 'missing.png') }),
  ).rejects.toMatchObject({ code: 'REF_NOT_FOUND' });
  await expect(
    call('design.addRef', { source: 'https://' }),
  ).rejects.toMatchObject({ code: 'REF_INVALID' });
  expect(
    JSON.parse(await readFile(join(root, 'docs/design/refs.json'), 'utf8'))
      .files,
  ).toHaveLength(2);
  await expect(addRef(root, 'file:///etc/passwd')).rejects.toBeTruthy();
});

test('submit_themes rejects low contrast, duplicates and wrong counts; accepts valid themes', async () => {
  const errs: any[] = [];
  await setup(async function* (req, ph) {
    if (ph !== 'themer') return;
    errs.push(
      await svc
        .callTool(req.runId, 'submit_themes', {
          themes: [theme('a', { text: '#CCCCCC' }), theme('b')],
        })
        .catch((e) => e),
    );
    errs.push(
      await svc
        .callTool(req.runId, 'submit_themes', {
          themes: [theme('a'), theme('a')],
        })
        .catch((e) => e),
    );
    errs.push(
      await svc
        .callTool(req.runId, 'submit_themes', { themes: [theme('a')] })
        .catch((e) => e),
    );
    await svc.callTool(req.runId, 'submit_themes', {
      themes: [theme('a'), theme('b')],
    });
  });
  await call('chat.send', { stage: 'design', text: 'clean and calm' });
  const s = await idle();
  expect(errs.map((e) => e.code)).toEqual([
    'THEME_CONTRAST',
    'THEMES_INVALID',
    'TOOL_ARGS_INVALID',
  ]);
  expect(s.themes?.map((t) => t.id)).toEqual(['a', 'b']);
  expect(s.picked).toBeNull();
});

test('themes are proposed once; the critic waits for a pick', async () => {
  await setup(proposing);
  await call('chat.send', { stage: 'design', text: 'calm' });
  let s = await idle();
  expect(s.themes).toHaveLength(2);
  expect(seen.critic).toHaveLength(0);
  expect(s.rounds).toBe(0);
  await call('chat.send', { stage: 'design', text: 'more thoughts' });
  await idle();
  expect(seen.themer).toHaveLength(1); // not re-proposed
  expect(seen.themer[0]).toContain('calm');
  s = await snap();
  expect(s.picked).toBeNull();
});

test('pick -> design form prefilled with the theme -> submit writes DESIGN.md + tokens.json, then critiques', async () => {
  await setup(proposing);
  await call('chat.send', { stage: 'design', text: 'calm' });
  await idle();
  await call('design.pickTheme', { themeId: 'night' });
  const f = await waitFor(
    () =>
      notes.find(
        (n) => n.m === 'form.requested' && n.p.templateId === 'design_schema',
      )?.p,
  );
  expect(f.prefill.color_bg).toBe('#0B0D0F');
  expect(f.aiFilled).toContain('color_accent');
  // invalid: text unreadable on bg -> rejected by the engine, nothing written
  const bad = { ...f.prefill, color_text: '#101010' };
  await expect(
    call('form.submit', { formId: f.formId, values: bad, unsure: [] }),
  ).rejects.toMatchObject({ code: 'DESIGN_CONTRAST' });
  expect(existsSync(join(dir, 'p/docs/DESIGN.md'))).toBe(false);
  const tweaked = {
    ...f.prefill,
    radius: 12,
    motion: 'none',
    references: [{ url: 'https://example.com/ref' }],
  };
  await call('form.submit', { formId: f.formId, values: tweaked, unsure: [] });
  const s = await idle();
  const tj = JSON.parse(
    await readFile(join(dir, 'p/docs/design/tokens.json'), 'utf8'),
  );
  expect(tj).toMatchObject({
    name: 'NIGHT',
    radius: 12,
    motion: 'none',
    colors: { bg: '#0B0D0F', accent: '#FF6B1A' },
  });
  const md = await readFile(join(dir, 'p/docs/DESIGN.md'), 'utf8');
  for (const h2 of [
    '## Overview',
    '## Color',
    '## Typography',
    '## Spacing and radius',
    '## Motion',
    '## Components',
    '## References',
  ])
    expect(md).toContain(h2);
  expect(md).toContain('`#FF6B1A`');
  expect(md).toContain('https://example.com/ref');
  expect(s.picked).toMatchObject({ themeId: 'night', name: 'NIGHT' });
  expect(s.rounds).toBe(1);
  expect(seen.critic[0]).toContain('NIGHT');
  // gate: zero blocking -> design completes
  await call('stage.complete', { stage: 'ideation' }).catch(() => {});
});

test('pickTheme with tweaks skips the form; unknown theme is refused', async () => {
  await setup(proposing);
  await call('chat.send', { stage: 'design', text: 'calm' });
  await idle();
  await expect(
    call('design.pickTheme', { themeId: 'nope' }),
  ).rejects.toMatchObject({ code: 'THEME_NOT_FOUND' });
  await call('design.pickTheme', {
    themeId: 'daylight',
    tweaks: { radius: 2 },
  });
  const s = await idle();
  expect(s.picked?.tokens.radius).toBe(2);
  expect(notes.some((n) => n.m === 'form.requested')).toBe(false);
  expect(
    JSON.parse(await readFile(join(dir, 'p/docs/design/tokens.json'), 'utf8'))
      .radius,
  ).toBe(2);
});

test('design gate: completes only after a critic round with zero blocking', async () => {
  await setup(proposing);
  await h._projects.complete('ideation', 'skip');
  await expect(
    call('stage.complete', { stage: 'design' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  await call('chat.send', { stage: 'design', text: 'calm' });
  await idle();
  await call('design.pickTheme', { themeId: 'daylight', tweaks: {} });
  await idle();
  const done = await call('stage.complete', { stage: 'design' });
  expect(done.stages.design.status).toBe('complete');
});

test('design.propose re-runs the themer with feedback', async () => {
  await setup(proposing);
  await call('design.propose', { feedback: 'warmer please' });
  await idle();
  expect(seen.themer[0]).toContain('warmer please');
});

test('token <-> form value mapping round-trips and validates', () => {
  const t = tokens();
  expect(tokensFromFormValues(formValuesFromTokens(t))).toEqual(t);
  expect(() =>
    tokensFromFormValues({ ...formValuesFromTokens(t), color_bg: 'red' }),
  ).toThrowError(/bg/);
  expect(
    renderDesignMd({
      projectName: 'p',
      themeName: 'T',
      description: 'd',
      tokens: t,
      refs: { files: [], links: [] },
    }),
  ).toContain('_None yet._');
});

test('figma: the token is only referenced in the MCP config and travels via run env', async () => {
  const root = await mkdtemp(join(tmpdir(), 'awp-mcp-'));
  const bridge = await startBridge(async () => ({}));
  const launch = mcpLauncher(root, bridge, async () => 'figd_SECRET');
  const withFigma = await launch('r1', { figma: true });
  expect(withFigma.env).toEqual({ FIGMA_TOKEN: 'figd_SECRET' });
  const cfg = await readFile(withFigma.path, 'utf8');
  expect(cfg).toContain('${FIGMA_TOKEN}');
  expect(cfg).not.toContain('figd_SECRET');
  const without = await launch('r2', { figma: false });
  expect(without.env).toBeUndefined();
  expect(await readFile(without.path, 'utf8')).not.toContain('figma');
  bridge.close();
});

import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import {
  contrastRatio,
  DENSITY_SPACING,
  type DesignRefs,
  DesignTokens,
  type FormValues,
} from '@awp/protocol';
import { EngineError } from '../errors';

const REF_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
]);
const MAX_REF_BYTES = 25 * 1024 * 1024;

const refsFile = (root: string) => join(root, 'docs', 'design', 'refs.json');

export async function readRefs(root: string): Promise<DesignRefs> {
  try {
    return JSON.parse(await readFile(refsFile(root), 'utf8'));
  } catch {
    return { files: [], links: [] };
  }
}

async function saveRefs(root: string, refs: DesignRefs) {
  await mkdir(join(root, 'docs', 'design'), { recursive: true });
  await writeFile(refsFile(root), JSON.stringify(refs, null, 2));
}

/** Adds a URL / Figma link, or copies a local image or PDF into docs/design/refs/. */
export async function addRef(
  root: string,
  source: string,
): Promise<DesignRefs> {
  const refs = await readRefs(root);
  if (/^https?:\/\//i.test(source)) {
    let host: string;
    try {
      host = new URL(source).hostname;
    } catch {
      throw new EngineError('REF_INVALID', 'That is not a valid URL');
    }
    if (!refs.links.some((l) => l.url === source))
      refs.links.push({
        url: source,
        kind: /(^|\.)figma\.com$/i.test(host) ? 'figma' : 'url',
      });
    await saveRefs(root, refs);
    return refs;
  }
  const ext = extname(source).toLowerCase();
  if (!REF_EXT.has(ext))
    throw new EngineError(
      'REF_TYPE',
      'Use an image (png, jpg, gif, webp, svg) or a PDF',
      'Pick another file.',
    );
  const info = await stat(source).catch(() => null);
  if (!info?.isFile())
    throw new EngineError('REF_NOT_FOUND', 'That file could not be read');
  if (info.size > MAX_REF_BYTES)
    throw new EngineError('REF_TOO_BIG', 'Files up to 25 MB are supported');
  const dir = join(root, 'docs', 'design', 'refs');
  await mkdir(dir, { recursive: true });
  const stem =
    basename(source, ext)
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 60) || 'ref';
  let name = `${stem}${ext}`;
  for (let n = 2; refs.files.some((f) => f.name === name); n++)
    name = `${stem}-${n}${ext}`;
  await copyFile(source, join(dir, name));
  refs.files.push({ name, path: `docs/design/refs/${name}` });
  await saveRefs(root, refs);
  return refs;
}

// ---- tokens <-> design_schema form values ----

export function formValuesFromTokens(t: DesignTokens): FormValues {
  const c = t.colors;
  return {
    color_bg: c.bg,
    color_surface: c.surface,
    color_text: c.text,
    color_text_muted: c.textMuted,
    color_accent: c.accent,
    color_on_accent: c.onAccent,
    color_line: c.line,
    color_success: c.success,
    color_warning: c.warning,
    color_danger: c.danger,
    font_sans: t.fonts.sans,
    font_mono: t.fonts.mono,
    density: t.density,
    radius: t.radius,
    motion: t.motion,
  };
}

export function tokensFromFormValues(v: FormValues): DesignTokens {
  const density = (v.density as keyof typeof DENSITY_SPACING) ?? 'comfortable';
  const parsed = DesignTokens.safeParse({
    colors: {
      bg: v.color_bg,
      surface: v.color_surface,
      text: v.color_text,
      textMuted: v.color_text_muted,
      accent: v.color_accent,
      onAccent: v.color_on_accent,
      line: v.color_line,
      success: v.color_success,
      warning: v.color_warning,
      danger: v.color_danger,
    },
    fonts: { sans: v.font_sans, mono: v.font_mono },
    radius: Number(v.radius),
    spacing: DENSITY_SPACING[density] ?? 4,
    density,
    motion: v.motion,
  });
  if (!parsed.success)
    throw new EngineError(
      'DESIGN_INVALID',
      parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  return parsed.data;
}

// ---- documents ----

export const renderTokensJson = (name: string, t: DesignTokens) =>
  JSON.stringify({ name, ...t }, null, 2);

const ratio = (a: string, b: string) => `${contrastRatio(a, b).toFixed(1)}:1`;

export function renderDesignMd(args: {
  projectName: string;
  themeName: string;
  description: string;
  tokens: DesignTokens;
  refs: DesignRefs;
}): string {
  const { tokens: t, refs } = args;
  const c = t.colors;
  const refLines = [
    ...refs.files.map((f) => `- [${f.name}](${f.path.replace(/^docs\//, '')})`),
    ...refs.links.map(
      (l) => `- ${l.kind === 'figma' ? 'Figma: ' : ''}${l.url}`,
    ),
  ];
  return `# Design: ${args.projectName}

## Overview

Theme: **${args.themeName}**. ${args.description}

Machine-readable tokens: [design/tokens.json](design/tokens.json).

## Color

| Token | Value | Use |
|---|---|---|
| bg | \`${c.bg}\` | App background |
| surface | \`${c.surface}\` | Cards, inputs |
| text | \`${c.text}\` | Primary text (${ratio(c.text, c.bg)} on bg) |
| textMuted | \`${c.textMuted}\` | Secondary text (${ratio(c.textMuted, c.bg)} on bg) |
| accent | \`${c.accent}\` | Primary actions (${ratio(c.onAccent, c.accent)} text on accent) |
| onAccent | \`${c.onAccent}\` | Text on accent fills |
| line | \`${c.line}\` | Borders |
| success | \`${c.success}\` | Pass, done |
| warning | \`${c.warning}\` | Caution |
| danger | \`${c.danger}\` | Errors, destructive |

## Typography

- Interface: ${t.fonts.sans}
- Code: ${t.fonts.mono}

## Spacing and radius

- Density: ${t.density}; base unit ${t.spacing}px (scale: ${[1, 2, 3, 4, 6, 8].map((n) => n * t.spacing).join(', ')}).
- Corner radius: ${t.radius}px.

## Motion

${{ none: 'No animation; state changes are instant.', subtle: 'Short, quiet transitions (120-200 ms).', expressive: 'Deliberate, noticeable motion (200-400 ms) with easing.' }[t.motion]}

## Components

Buttons, inputs, and cards use the tokens above. One accent-filled button per view; status always pairs color with text or an icon.

## References

${refLines.length ? refLines.join('\n') : '_None yet._'}
`;
}

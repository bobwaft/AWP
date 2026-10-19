import { createHash } from 'node:crypto';
import type { SectionSchema } from '@awp/prompts';

const norm = (s: string) =>
  s
    .replace(/\(.*?\)/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Body text of each required section (by id), found by heading title; '' when missing. */
export function requiredSectionTexts(
  schema: SectionSchema,
  spec: string,
): Record<string, string> {
  const lines = spec.split(/\r?\n/);
  const heads: { at: number; level: number; title: string }[] = [];
  lines.forEach((l, at) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) heads.push({ at, level: m[1].length, title: norm(m[2]) });
  });
  const out: Record<string, string> = {};
  for (const s of schema.sections.filter((x) => x.required)) {
    const want = norm(s.title);
    const i = heads.findIndex((h) => h.title === want);
    if (i < 0) {
      out[s.id] = '';
      continue;
    }
    // Runs to the next heading of the same or a higher level; subsections count as body.
    const end = heads.slice(i + 1).find((h) => h.level <= heads[i].level);
    out[s.id] = lines
      .slice(heads[i].at + 1, end ? end.at : lines.length)
      .join('\n')
      .trim();
  }
  return out;
}

/** A hash of each required section's current text, stored when a critique is recorded. */
export function hashSections(
  schema: SectionSchema,
  spec: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(requiredSectionTexts(schema, spec)).map(([id, t]) => [
      id,
      createHash('sha1').update(t).digest('hex'),
    ]),
  );
}

/**
 * Readiness 0-100, no agent call. A required section the critic scored and that is unchanged
 * since keeps the critic's score; any other scores 0 if empty, 100 if filled. Average of all.
 */
export function scoreReadiness(
  schema: SectionSchema,
  spec: string,
  critic?: {
    readiness: Record<string, number>;
    hashes: Record<string, string>;
  },
): number | null {
  const texts = requiredSectionTexts(schema, spec);
  const ids = Object.keys(texts);
  if (!ids.length) return null;
  const now = hashSections(schema, spec);
  const scores = ids.map((id) => {
    const kept = critic?.readiness[id];
    if (kept !== undefined && critic?.hashes[id] === now[id]) return kept;
    return texts[id] ? 100 : 0;
  });
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

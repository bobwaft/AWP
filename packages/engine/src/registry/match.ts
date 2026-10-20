import { type Kind, RegistryItem } from '@awp/protocol';
import { licenseStatus } from './license';
import type { RecommenderItem } from './recommender-parse';

export type Specs = { prd: string; design: string; architecture: string };

export type Candidate = {
  id: string;
  item: RegistryItem;
  source: 'registry' | 'recommender';
  verified: boolean;
  /** Nothing AWP can install: a hook, subagent, command or skill to write. */
  idea: boolean;
  category?: string;
  reason: string;
  preChecked: boolean;
  /** Same pick-one group, not chosen. */
  alternatives: string[];
};

export type Rejected = { ids: Set<string>; repoKeys: Set<string> };

/** Lower-case host/owner/repo, without `.git` or a trailing slash. */
export function repoKey(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
    return `${u.host}${path}`.toLowerCase();
  } catch {
    return undefined;
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, phrase: string) =>
  new RegExp(`(^|[^a-z0-9])${esc(phrase.toLowerCase())}([^a-z0-9]|$)`).test(
    text,
  );

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
export const slug = (s: string) => tokens(s).join('-').slice(0, 60) || 'item';

/** Recommender kinds that can be the same thing as a registry kind. */
const COMPAT: Record<string, Kind[]> = {
  mcp: ['mcp', 'connector'],
  plugin: ['plugin'],
  skill: ['skill', 'plugin'],
};

function matchesRegistry(r: RecommenderItem, item: RegistryItem): boolean {
  if (!(COMPAT[r.kind] ?? []).includes(item.kind)) return false;
  const rk = repoKey(r.repoUrl);
  if (rk && rk === repoKey(item.source.repo)) return true;
  const t = tokens(r.name);
  const idTokens = tokens(item.id);
  const joined = t.join('-');
  if (joined === item.id) return true;
  // all of the id's words appear as whole words in the name ("Supabase MCP" ~ supabase)
  return (
    idTokens.length > 0 &&
    idTokens.every((w) => t.includes(w)) &&
    item.id.length >= 4
  );
}

const IDEA_KINDS = new Set(['hook', 'subagent', 'command', 'other']);

/**
 * Merges registry matches with the recommender's output (PRD §5.5). Registry items are verified;
 * recommender-only items are unverified and AWP never runs their install text. One item per
 * pick-one group, any number from complementary groups; guards and rejections are honoured.
 */
export function suggest(input: {
  registry: { items: RegistryItem[] };
  specs: Specs;
  recommender: RecommenderItem[];
  rejected: Rejected;
}): Candidate[] {
  const text =
    `${input.specs.prd}\n${input.specs.design}\n${input.specs.architecture}`.toLowerCase();
  const prdText = input.specs.prd.toLowerCase();
  const isRejected = (id: string, repo?: string) => {
    const k = repoKey(repo);
    return (
      input.rejected.ids.has(id) ||
      (k !== undefined && input.rejected.repoKeys.has(k))
    );
  };

  type Scored = {
    item: RegistryItem;
    score: number;
    reason: string;
    defaultOn: boolean;
  };
  const usedRecommender = new Set<RecommenderItem>();
  const scored: Scored[] = [];

  for (const item of input.registry.items) {
    if (item.tags.includes('internal') || !item.agents.includes('claude'))
      continue;
    if (isRejected(item.id, item.source.repo)) continue;
    if (item.guards.some((g) => g.when.some((w) => mentions(prdText, w))))
      continue;

    const rec = input.recommender.find((r) => matchesRegistry(r, item));
    if (rec) usedRecommender.add(rec);
    const hit = item.tags.find((t) => mentions(text, t));
    const defaultOn =
      item.default &&
      (!item.defaultWhen?.length ||
        item.defaultWhen.some((w) => mentions(text, w)));
    const awp = item.tags.includes('awp-native');
    if (!defaultOn && !rec && !hit && !awp) continue;
    if (licenseStatus(item).status === 'blocked') continue;

    const reason = rec?.why
      ? rec.why
      : hit
        ? `Your specs mention "${hit}".`
        : awp
          ? 'Built for projects made with AWP.'
          : 'Default for new projects.';
    scored.push({
      item,
      reason,
      defaultOn: !!defaultOn,
      score: (defaultOn ? 100 : 0) + (rec ? 50 : 0) + (hit ? 5 : 0),
    });
  }

  // pick-one groups keep their best item; the others become alternatives
  const out: Candidate[] = [];
  const byGroup = new Map<string, Scored[]>();
  for (const s of scored) {
    const g = s.item.groupMode === 'pick-one' ? s.item.group : undefined;
    if (!g) {
      out.push(toCandidate(s, []));
      continue;
    }
    byGroup.set(g, [...(byGroup.get(g) ?? []), s]);
  }
  for (const [g, list] of byGroup) {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    const rest = input.registry.items
      .filter(
        (i) =>
          i.group === g &&
          i.id !== sorted[0].item.id &&
          !isRejected(i.id, i.source.repo),
      )
      .map((i) => i.id);
    out.push(toCandidate(sorted[0], rest));
  }

  const order = new Map(input.registry.items.map((it, i) => [it.id, i]));
  out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  // recommender-only items: unverified, never auto-installed
  for (const r of input.recommender) {
    if (usedRecommender.has(r)) continue;
    const id = slug(r.name);
    if (isRejected(id, r.repoUrl) || out.some((c) => c.id === id)) continue;
    const idea =
      IDEA_KINDS.has(r.kind) ||
      (r.kind === 'skill' && !r.repoUrl && !!r.create);
    const kind: Kind =
      r.kind === 'mcp'
        ? 'mcp'
        : r.kind === 'plugin'
          ? 'plugin'
          : r.kind === 'skill'
            ? 'skill'
            : 'tool';
    const item = RegistryItem.parse({
      id,
      kind,
      name: r.name,
      summary: r.why || 'Suggested by the recommender.',
      source: r.repoUrl ? { repo: r.repoUrl } : {},
      license: 'unknown',
      verified: false,
      stages: [],
      tags: [],
      install: {
        type: 'doc',
        ...(r.install || r.create || r.where
          ? { command: r.install ?? r.create ?? r.where }
          : {}),
      },
      flags: { notes: ['Suggested by the recommender; not reviewed by AWP.'] },
    });
    out.push({
      id,
      item,
      source: 'recommender',
      verified: false,
      idea,
      category: r.category,
      reason: r.why || 'Recommended for this project.',
      preChecked: false,
      alternatives: [],
    });
  }
  return out;
}

function toCandidate(
  s: { item: RegistryItem; reason: string; defaultOn: boolean },
  alternatives: string[],
): Candidate {
  return {
    id: s.item.id,
    item: s.item,
    source: 'registry',
    verified: s.item.verified,
    idea: false,
    reason: s.reason,
    preChecked: s.defaultOn && s.item.verified,
    alternatives,
  };
}

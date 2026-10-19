import { loadPrompt, render } from '@awp/prompts';
import type { Kind, RegistryFile, SuggestionsInput } from '@awp/protocol';
import { type Candidate, type Rejected, type Specs, suggest } from './match';
import {
  parseRecommendations,
  type RecommenderItem,
  type RecommenderKind,
} from './recommender-parse';

export type DiscoveryRun = {
  prompt: string;
  pluginDirs: string[];
  allowedTools: string[];
  disallowedTools: string[];
};

export type DiscoverDeps = {
  registry: RegistryFile;
  specs: Specs;
  rejected: Rejected;
  /** Directory of the claude-code-setup plugin for this run only, or null when unavailable. */
  ensurePlugin: () => Promise<string | null>;
  /** Runs the agent once; `submitted` is what it passed to submit_suggestions (null if it never did). */
  runAgent: (req: DiscoveryRun) => Promise<{
    status: 'success' | 'error' | 'stopped';
    text: string;
    submitted: SuggestionsInput | null;
  }>;
};

export type DiscoverResult = {
  candidates: Candidate[];
  source: 'tool' | 'markdown' | 'registry-only';
  /** Why a fallback was used, for the UI. */
  note?: string;
};

const KINDS: Record<Kind, RecommenderKind> = {
  mcp: 'mcp',
  connector: 'mcp',
  plugin: 'plugin',
  skill: 'skill',
  library: 'other',
  tool: 'other',
};

/**
 * Project-tailored discovery (ARCHITECTURE.md). Ladder: (a) the agent reports through
 * submit_suggestions; (b) it only printed the recommender's markdown, which we parse; (c) the
 * plugin or the run is unavailable, so registry matching alone. Registry matching always runs.
 */
export async function discover(d: DiscoverDeps): Promise<DiscoverResult> {
  let recommender: RecommenderItem[] = [];
  let source: DiscoverResult['source'] = 'registry-only';
  let note: string | undefined;

  let plugin: string | null = null;
  try {
    plugin = await d.ensurePlugin();
  } catch (e) {
    note = `The project recommender could not be loaded (${msg(e)}). Showing AWP's own matches.`;
  }
  if (!plugin && !note)
    note =
      "The project recommender isn't available. Showing AWP's own matches.";

  if (plugin) {
    try {
      const run = await d.runAgent({
        prompt: render(loadPrompt('connectors.suggester').body, {
          prd: d.specs.prd || '(none)',
          design: d.specs.design || '(none)',
          architecture: d.specs.architecture || '(none)',
          registry: d.registry.items
            .filter((i) => !i.tags.includes('internal'))
            .map((i) => `${i.id}: ${i.name}`)
            .join('\n'),
        }),
        pluginDirs: [plugin],
        allowedTools: [
          'Read',
          'Glob',
          'Grep',
          'WebSearch',
          'mcp__awp__submit_suggestions',
        ],
        disallowedTools: ['Bash', 'Write', 'Edit'],
      });
      if (run.submitted) {
        recommender = fromSubmitted(run.submitted, d.registry);
        source = 'tool';
      } else {
        const parsed = parseRecommendations(run.text);
        if (parsed.length) {
          recommender = parsed;
          source = 'markdown';
        } else if (run.status === 'error') {
          note =
            "The project recommender run failed. Showing AWP's own matches.";
        } else {
          note =
            "The project recommender returned nothing usable. Showing AWP's own matches.";
        }
      }
    } catch (e) {
      note = `The project recommender run failed (${msg(e)}). Showing AWP's own matches.`;
    }
  }

  return {
    candidates: suggest({
      registry: d.registry,
      specs: d.specs,
      recommender,
      rejected: d.rejected,
    }),
    source,
    note: source === 'registry-only' ? note : undefined,
  };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Turns the agent's tool input into recommender items. Unknown registry ids are dropped. */
function fromSubmitted(
  s: SuggestionsInput,
  registry: RegistryFile,
): RecommenderItem[] {
  const out: RecommenderItem[] = [];
  for (const x of s.suggestions) {
    if (x.id) {
      const item = registry.items.find((i) => i.id === x.id);
      if (!item) continue; // never trust an id AWP does not know
      out.push({
        name: item.name,
        kind: KINDS[item.kind],
        category: x.category ?? item.group ?? '',
        why: x.why,
        repoUrl: item.source.repo,
      });
      continue;
    }
    out.push({
      name: x.name as string,
      kind: (x.kind ? KINDS[x.kind] : 'other') as RecommenderKind,
      category: x.category ?? '',
      why: x.why,
      install: x.installCommand,
      repoUrl: x.repoUrl,
    });
  }
  return out;
}

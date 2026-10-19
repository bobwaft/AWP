import { z } from 'zod';
import { StageId } from './project';

// Registry item schema (ARCHITECTURE.md "Registry"). registry.json is untrusted until it parses here.

export const KINDS = [
  'skill',
  'plugin',
  'mcp',
  'connector',
  'library',
  'tool',
] as const;
export const Kind = z.enum(KINDS);
export type Kind = z.infer<typeof Kind>;

/** How an item is installed; one per item (mixed "skill + CLI" items pick one primary). */
export const INSTALL_KINDS = [
  'skill', // copy a folder from the pinned commit into .claude/skills/<id>/
  'plugin', // .claude/settings.json marketplace + enabledPlugins (config only)
  'mcp', // entry in .mcp.json (stdio or remote)
  'installer', // a remote installer the user's own tooling runs (argv only)
  'doc', // recorded in docs/TOOLING.md; the executor installs it
] as const;

const Sha = z
  .string()
  .regex(/^[0-9a-f]{40}$/, 'Pin a full 40-character commit SHA');
const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/** A secret may only appear as `${VAR}`; a literal token would end up in a committed file. */
const EnvRef = z
  .string()
  .regex(/^(?:[^$]*\$\{[A-Z][A-Z0-9_]*\})+[^$]*$/, 'Use a ${VAR} reference');

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|CONNECTION|CREDENTIAL|AUTH)/i;

/** Env values: `${VAR}` for anything secret-like; short plain literals only for config flags. */
const EnvValue = z.string();
const EnvMap = z.record(z.string(), EnvValue).superRefine((env, ctx) => {
  for (const [k, v] of Object.entries(env)) {
    const ref = EnvRef.safeParse(v).success;
    const flag = !SECRET_NAME.test(k) && /^[\w.-]{1,40}$/.test(v);
    if (!ref && !flag)
      ctx.addIssue({
        code: 'custom',
        message: `${k}: use a \${VAR} reference (literals only for non-secret flags)`,
        path: [k],
      });
  }
});

const StdioEntry = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: EnvMap.optional(),
});
const HttpEntry = z.object({
  type: z.literal('http'),
  url: z.string().regex(/^https:\/\//, 'Remote servers must use https'),
  headers: z.record(z.string(), EnvRef).optional(),
});
export const McpEntry = z.union([HttpEntry, StdioEntry]);
export type McpEntry = z.infer<typeof McpEntry>;

export const Install = z.discriminatedUnion('type', [
  z.object({ type: z.literal('skill') }),
  z.object({
    type: z.literal('plugin'),
    /** `/plugin marketplace add <this>`: owner/repo or a URL. */
    marketplace: z.string().min(1),
    /** `<plugin>@<marketplace-name>` */
    plugin: z.string().regex(/^[\w.-]+@[\w.-]+$/),
    /** Commit to pin the marketplace to, only when Claude Code is known to honour it. */
    ref: z.string().optional(),
  }),
  z.object({ type: z.literal('mcp'), entry: McpEntry }),
  z.object({
    type: z.literal('installer'),
    /** One or more argv lists, run in order with execFile (never a shell string). */
    commands: z.array(z.array(z.string().min(1)).min(1)).min(1),
  }),
  z.object({ type: z.literal('doc'), command: z.string().optional() }),
]);
export type Install = z.infer<typeof Install>;

export const Guard = z.object({
  /** Keywords; the guard trips when the PRD matches any (case-insensitive). */
  when: z.array(z.string().min(1)).min(1),
  action: z.literal('skip'),
  note: z.string().min(1),
});

export const RegistryItem = z
  .object({
    id: Id,
    kind: Kind,
    name: z.string().min(1),
    summary: z.string().min(1),
    source: z.object({
      repo: z.string().url().optional(),
      path: z.string().optional(),
      sha: Sha.optional(),
      /** git tree SHA of `path` at `sha`; required when the install copies files. */
      tree: Sha.optional(),
    }),
    license: z.string().min(1),
    /** Owner-verified in the seed list; recommender-only items are never verified. */
    verified: z.boolean().default(true),
    agents: z.array(z.string()).default(['claude']),
    stages: z.array(StageId).default([]),
    tags: z.array(z.string()).default([]),
    group: z.string().optional(),
    groupMode: z.enum(['pick-one', 'complementary']).default('complementary'),
    /** Pre-checked when a project reaches Connectors (REGISTRY.md "Defaults"). */
    default: z.boolean().default(false),
    install: Install,
    variants: z
      .array(
        z.object({
          id: Id,
          label: z.string().min(1),
          /** True for a safer alternative to the default install (e.g. read-only). */
          safe: z.boolean().default(false),
          install: Install,
        }),
      )
      .default([]),
    guards: z.array(Guard).default([]),
    /** Stages in which this item must not be active (e.g. caveman in interview stages). */
    neverStages: z.array(StageId).default([]),
    requires: z
      .object({
        accounts: z.array(z.string()).default([]),
        env: z
          .array(
            z.object({
              name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
              secretKey: z.string().min(1),
              optional: z.boolean().default(false),
              help: z.string().optional(),
            }),
          )
          .default([]),
      })
      .default({ accounts: [], env: [] }),
    flags: z
      .object({
        telemetry: z.boolean().default(false),
        writes: z.boolean().default(false),
        cost: z.string().optional(),
        notes: z.array(z.string()).default([]),
      })
      .default({ telemetry: false, writes: false, notes: [] }),
  })
  .superRefine((item, ctx) => {
    if (
      item.install.type === 'skill' &&
      !(
        item.source.path &&
        item.source.tree &&
        item.source.sha &&
        item.source.repo
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A skill item needs source.repo, sha, path and tree',
        path: ['source'],
      });
  });
export type RegistryItem = z.infer<typeof RegistryItem>;

export const RegistryFile = z
  .object({
    /** Bumped on every release; a fetched copy older than the bundled one is ignored. */
    version: z.number().int().min(1),
    items: z.array(RegistryItem),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.items.forEach((it, i) => {
      if (seen.has(it.id))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate id ${it.id}`,
          path: ['items', i, 'id'],
        });
      seen.add(it.id);
    });
  });
export type RegistryFile = z.infer<typeof RegistryFile>;

// ---- suggestions (what the agent reports, what the engine stores) ----

const Why = z.string().min(1);
export const SuggestionInputItem = z
  .object({
    /** A registry id... */
    id: Id.optional(),
    /** ...or a recommender item with no id. */
    name: z.string().min(1).optional(),
    kind: Kind.optional(),
    repoUrl: z.string().url().optional(),
    installCommand: z.string().optional(),
    category: z.string().optional(),
    why: Why,
  })
  .refine((s) => s.id || s.name, 'Give a registry id or a name');
export const SuggestionsInput = z.object({
  suggestions: z.array(SuggestionInputItem).max(40),
});
export type SuggestionsInput = z.infer<typeof SuggestionsInput>;

export const SuggestionStatus = z.enum([
  'suggested',
  'approved',
  'rejected',
  'installed',
  'failed',
]);

/** One row of `.awp/suggestions.json`. */
export const Suggestion = z.object({
  id: z.string(),
  /** Normalized host/owner/repo, so a rejection also matches the same repo under another id. */
  repoKey: z.string().optional(),
  source: z.enum(['registry', 'recommender', 'user']),
  verified: z.boolean(),
  status: SuggestionStatus,
  reason: z.string(),
  /** Display data for items that are not in the registry. */
  item: RegistryItem.optional(),
  variant: z.string().optional(),
  error: z.string().optional(),
  at: z.string(),
});
export type Suggestion = z.infer<typeof Suggestion>;

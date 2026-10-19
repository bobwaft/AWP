import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DiscoveryInfo, Suggestion } from '@awp/protocol';
import {
  DiscoveryInfo as DiscoverySchema,
  Suggestion as SuggestionSchema,
} from '@awp/protocol';
import type { Rejected } from './match';

export type SuggestionsFile = { discovery: DiscoveryInfo; items: Suggestion[] };

/**
 * `.awp/suggestions.json`: what was suggested, approved, rejected and installed. Committed with
 * the project (no secrets) so a clone keeps its rejections. Changes are serialized.
 */
export class SuggestionStore {
  private chain: Promise<unknown> = Promise.resolve();
  private cache: SuggestionsFile | undefined;

  constructor(private root: string) {}

  private get file() {
    return join(this.root, '.awp', 'suggestions.json');
  }

  async load(): Promise<SuggestionsFile> {
    if (this.cache) return structuredClone(this.cache);
    const fresh: SuggestionsFile = { discovery: { status: 'idle' }, items: [] };
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch {
      return fresh;
    }
    try {
      const j = JSON.parse(raw);
      const discovery = DiscoverySchema.safeParse(j?.discovery);
      const items = (Array.isArray(j?.items) ? j.items : []).flatMap(
        (x: unknown) => {
          const r = SuggestionSchema.safeParse(x);
          return r.success ? [r.data] : [];
        },
      );
      // a run that was in flight when the app closed is not running any more
      const d = discovery.success ? discovery.data : fresh.discovery;
      this.cache = {
        discovery: d.status === 'running' ? { ...d, status: 'idle' } : d,
        items,
      };
    } catch {
      await writeFile(`${this.file}.corrupt`, raw).catch(() => {});
      this.cache = fresh;
    }
    return structuredClone(this.cache);
  }

  /** Runs `fn` on a copy of the state; the result is saved only if `fn` does not throw. */
  mutate<T = void>(fn: (s: SuggestionsFile) => T): Promise<T> {
    const run = async () => {
      const s = await this.load();
      const out = fn(s);
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(s, null, 2)}\n`);
      await rename(tmp, this.file);
      this.cache = s;
      return out;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }
}

export function rejectedFrom(items: Suggestion[]): Rejected {
  const ids = new Set<string>();
  const repoKeys = new Set<string>();
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    ids.add(i.id);
    if (i.repoKey) repoKeys.add(i.repoKey);
  }
  return { ids, repoKeys };
}

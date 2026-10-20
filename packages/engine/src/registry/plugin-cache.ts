import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fetchSource } from './git-fetch';
import { type Caps, checkPath } from './preview';

export type PluginSource = {
  repo?: string;
  sha?: string;
  path?: string;
  tree?: string;
};

const DONE = '.awp-complete';

/**
 * Roomier than the skill caps: this folder is pinned to a commit and tree hash the owner reviewed
 * (the real plugin ships a 545 KB screenshot). Symlinks and unsafe paths are still refused.
 */
const PLUGIN_CAPS: Caps = {
  maxFiles: 200,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
};

/**
 * Makes the plugin folder available for one `--plugin-dir` run: fetched at its pinned commit,
 * tree-checked against the registry, written under app data once and reused. Returns null (never
 * throws) when it cannot be had, so discovery falls back to registry matching.
 */
export async function ensurePluginDir(opts: {
  dataDir: string;
  source: PluginSource;
  allowAnyUrl?: boolean;
}): Promise<string | null> {
  const { repo, sha, path } = opts.source;
  if (!repo || !sha) return null;
  const key = `${sha.slice(0, 12)}-${(opts.source.tree ?? 'x').slice(0, 12)}-${(path ?? '').replace(/[^\w.-]+/g, '_')}`;
  const dest = join(opts.dataDir, 'plugins', key);
  if (existsSync(join(dest, DONE))) return dest;

  try {
    const src = await fetchSource({
      cacheDir: join(opts.dataDir, 'registry-git'),
      repo,
      sha,
      path: path ?? '',
      expectedTree: opts.source.tree,
      allowAnyUrl: opts.allowAnyUrl,
    });
    let total = 0;
    if (src.files.length > PLUGIN_CAPS.maxFiles) return null;
    for (const f of src.files) {
      if (f.mode === '120000' || f.mode === '160000' || f.type === 'commit')
        return null;
      checkPath(f.path);
      if (f.size > PLUGIN_CAPS.maxFileBytes) return null;
      total += f.size;
    }
    if (total > PLUGIN_CAPS.maxTotalBytes) return null;

    const tmp = `${dest}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      for (const f of src.files) {
        const out = resolve(tmp, f.path);
        if (!out.startsWith(resolve(tmp) + sep)) return null;
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, await src.read(f.path));
      }
      await writeFile(join(tmp, DONE), '');
      await mkdir(dirname(dest), { recursive: true });
      await rm(dest, { recursive: true, force: true });
      await rename(tmp, dest);
    } catch {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
      return null;
    }
    return dest;
  } catch {
    return null;
  }
}

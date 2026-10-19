import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RegistryFile } from '@awp/protocol';
import bundledJson from '../../../../registry/registry.json';

/** The snapshot compiled into the engine; always valid (a test checks it). */
export function bundledRegistry(): RegistryFile {
  return RegistryFile.parse(bundledJson);
}

export type RegistrySource = 'remote' | 'cache' | 'bundled';

export type LoadOpts = {
  /** App-data dir; the cache lives in `registry-cache.json`. */
  dataDir: string;
  /** Override the shipped snapshot (tests). */
  bundled?: RegistryFile;
  /** Fetches the raw registry JSON from a tagged release. Omit to stay offline. */
  fetchRemote?: () => Promise<unknown>;
};

const cacheFile = (dir: string) => join(dir, 'registry-cache.json');

/** A copy is trusted only if it parses and is not older than what shipped with the app. */
function accept(raw: unknown, floor: number): RegistryFile | null {
  const r = RegistryFile.safeParse(raw);
  return r.success && r.data.version >= floor ? r.data : null;
}

/**
 * Remote (tagged release) > cache > bundled. A fetched or cached copy must validate against
 * the schema and have a version at or above the bundled snapshot, so a stale cache, a rollback
 * or a broken fetch can never weaken the registry.
 */
export async function loadRegistry(
  opts: LoadOpts,
): Promise<{ registry: RegistryFile; source: RegistrySource }> {
  const bundled = opts.bundled ?? bundledRegistry();

  if (opts.fetchRemote) {
    try {
      const remote = accept(await opts.fetchRemote(), bundled.version);
      if (remote) {
        await writeCache(opts.dataDir, remote);
        return { registry: remote, source: 'remote' };
      }
    } catch {
      // offline or a bad response: fall through to the cache
    }
  }

  try {
    const c = JSON.parse(await readFile(cacheFile(opts.dataDir), 'utf8'));
    const cached = accept(c?.registry, bundled.version);
    if (cached) return { registry: cached, source: 'cache' };
  } catch {
    // no cache or unreadable
  }
  return { registry: bundled, source: 'bundled' };
}

async function writeCache(dir: string, registry: RegistryFile) {
  await mkdir(dir, { recursive: true });
  const tmp = `${cacheFile(dir)}.${process.pid}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify({ fetchedAt: new Date().toISOString(), registry }),
  );
  await rename(tmp, cacheFile(dir));
}

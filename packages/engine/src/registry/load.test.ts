import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { bundledRegistry, loadRegistry } from './load';

const dir = () => mkdtempSync(join(tmpdir(), 'awp-reg-'));
const real = bundledRegistry();
// A bundled snapshot at version 5, so older/newer copies can be tested.
const bundled = { ...real, version: 5 };
const at = (version: number, n = 3) => ({
  ...real,
  version,
  items: real.items.slice(0, n),
});

test('the shipped snapshot is valid and used when nothing else is available', async () => {
  const r = await loadRegistry({ dataDir: dir() });
  expect(r.source).toBe('bundled');
  expect(r.registry.items.length).toBe(real.items.length);
});

test('a newer schema-valid remote copy is used and cached', async () => {
  const d = dir();
  const r = await loadRegistry({
    dataDir: d,
    bundled,
    fetchRemote: async () => at(6),
  });
  expect(r.source).toBe('remote');
  expect(r.registry.version).toBe(6);
  const cached = JSON.parse(
    readFileSync(join(d, 'registry-cache.json'), 'utf8'),
  );
  expect(cached.registry.version).toBe(6);
});

test('a remote copy older than the bundled one is ignored (no rollback)', async () => {
  const d = dir();
  const r = await loadRegistry({
    dataDir: d,
    bundled,
    fetchRemote: async () => at(4),
  });
  expect(r.source).toBe('bundled');
  expect(r.registry.version).toBe(5);
});

test('an invalid remote copy is ignored and the bundled one is used', async () => {
  const r = await loadRegistry({
    dataDir: dir(),
    bundled,
    fetchRemote: async () => ({ version: 99, items: [{ id: 'x' }] }),
  });
  expect(r.source).toBe('bundled');
});

test('a failed fetch falls back to the cache, then to bundled', async () => {
  const d = dir();
  await loadRegistry({ dataDir: d, bundled, fetchRemote: async () => at(6) });
  const offline = async () => {
    throw new Error('offline');
  };
  const r = await loadRegistry({ dataDir: d, bundled, fetchRemote: offline });
  expect(r.source).toBe('cache');
  expect(r.registry.version).toBe(6);
  // a corrupt cache file is ignored
  writeFileSync(join(d, 'registry-cache.json'), '{ nope');
  const r2 = await loadRegistry({ dataDir: d, bundled, fetchRemote: offline });
  expect(r2.source).toBe('bundled');
});

test('a cache older than the bundled snapshot (the app was updated) is ignored', async () => {
  const d = dir();
  writeFileSync(
    join(d, 'registry-cache.json'),
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      registry: at(4),
    }),
  );
  const r = await loadRegistry({ dataDir: d, bundled });
  expect(r.source).toBe('bundled');
});

test('a tampered cache that fails the schema is ignored', async () => {
  const d = dir();
  writeFileSync(
    join(d, 'registry-cache.json'),
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      registry: { version: 9, items: [{ id: 'evil', kind: 'mcp' }] },
    }),
  );
  const r = await loadRegistry({ dataDir: d, bundled });
  expect(r.source).toBe('bundled');
});

test('a version the app has accepted becomes a floor: later copies below it are ignored, even with the cache gone', async () => {
  const d = dir();
  await loadRegistry({ dataDir: d, bundled, fetchRemote: async () => at(8) });
  // an attacker or a stale mirror offers an older-but-newer-than-bundled copy
  const r = await loadRegistry({
    dataDir: d,
    bundled,
    fetchRemote: async () => at(6),
  });
  expect(r.source).toBe('cache');
  expect(r.registry.version).toBe(8);
  // delete the cache file: the floor is kept separately, so v6 still cannot come back
  rmSync(join(d, 'registry-cache.json'));
  const r2 = await loadRegistry({
    dataDir: d,
    bundled,
    fetchRemote: async () => at(6),
  });
  expect(r2.source).toBe('bundled');
  expect(r2.registry.version).toBe(5);
  // a newer version is still accepted and raises the floor
  const r3 = await loadRegistry({
    dataDir: d,
    bundled,
    fetchRemote: async () => at(9),
  });
  expect(r3.source).toBe('remote');
});

test('a corrupt floor file does not lock the registry out', async () => {
  const d = dir();
  writeFileSync(join(d, 'registry-floor.json'), '{ nope');
  const r = await loadRegistry({
    dataDir: d,
    bundled,
    fetchRemote: async () => at(6),
  });
  expect(r.source).toBe('remote');
});

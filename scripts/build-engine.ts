// Compiles the engine for the host target triple (or all with --all) into src-tauri/binaries.
import { $ } from 'bun';

const TARGETS: Record<string, string> = {
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-unknown-linux-gnu': 'bun-linux-x64',
};

const host = (await $`rustc -vV`.text()).match(/host: (\S+)/)?.[1] ?? '';
const triples = process.argv.includes('--all') ? Object.keys(TARGETS) : [host];

for (const triple of triples) {
  const target = TARGETS[triple];
  if (!target) throw new Error(`Unsupported target triple: ${triple}`);
  const ext = triple.includes('windows') ? '.exe' : '';
  const outfile = `apps/desktop/src-tauri/binaries/awp-engine-${triple}${ext}`;
  await $`bun build --compile --target=${target} packages/engine/src/main.ts --outfile ${outfile}`;
}

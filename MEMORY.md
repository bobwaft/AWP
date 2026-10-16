# MEMORY

## Phase 0
- Toolchain: Bun 1.4, Rust stable, Biome (config scoped to apps/packages/registry/assets; never run it over `.claude/`).
- Dev in WSL2: `bun run dev` prints libEGL/MESA/ZINK warnings. These are WSL GPU noise, not app errors.
- Root `dev` runs `tauri dev` from `apps/desktop`; `beforeDevCommand` is that package's `vite` script.
- `engine:build` is a stub until Phase 2. `csp` is null in tauri.conf.json: harden later.
- CI runs `bun run check`, then `cargo fmt --check`, clippy and `cargo test` on windows-latest and macos-latest.

## Phase 1
- Tokens: `src/styles/tokens.json` is mirrored by `tokens.css`; `tokens.test.ts` checks they match and runs AA contrast. `lib/theme.ts` always resolves System to `data-theme=dark|light` (no duplicated media-query CSS). Tailwind utilities (`bg-bg-1`, `text-text-2`, `text-accent`) come from `@theme inline` in tokens.css.
- Light theme values were chosen directly (not via an Impeccable session) and recorded in DESIGN.md §4.1; added tokens `--accent-bright`, `--on-accent`.
- Spec/AA conflicts left as spec has them (need human decision): dark `--text-3` is 4.1:1 on bg-0; dark `--line-strong` is 1.8:1; dark `--danger` is 4.39:1 on bg-3.
- Settings live in localStorage (`awp.settings`) for now, not the app-data `settings.json` from ARCHITECTURE.md; swap when the engine/Tauri fs owns it. Display mode is stored but no effect until the 3D scene (Phase 14).
- Component tests use `// @vitest-environment jsdom` per file with @testing-library/react. Biome needs `css.parser.tailwindDirectives` for `@theme`.
- Mock stage states: `MOCK_PROJECT` in `lib/stages.ts` (current 4, stage 3 stale). Right panel is an empty hidden `<aside>` slot.

## Phase 2
- Protocol: `packages/protocol` holds zod envelope + `methods` (params/result) + `notifications`. Add new RPC methods to `methods`; the engine rejects methods missing there. Errors: JSON-RPC numeric `code` plus stable string in `error.data.code`. Only `ping`/`version` and `toast`/`engine.*` exist; the other ARCHITECTURE §4 methods are added by the phase that implements them.
- Engine: `createHandler` in `server.ts` is pure (line in, line out) and is what tests hit. `main.ts` logs JSON lines to `$AWP_LOG_DIR/engine.log` (Rust sets it to app-data `logs/`; Linux: `~/.local/share/dev.awp.app/logs`). Log rotation by date is not done.
- `bun run engine:build` compiles to `src-tauri/binaries/awp-engine-<triple>` (`--all` for all targets). Tauri's build.rs needs that file to exist even in dev, so root `dev` runs `engine:build` first and CI runs it before cargo. Binaries are gitignored.
- Rust supervisor (`src-tauri/src/engine.rs`): debug builds run `bun run packages/engine/src/main.ts`; release runs `awp-engine` next to the app exe. `engine_request` returns the full JSON-RPC response; engine notifications are re-emitted on `engine://event` as `{method, params}`; the supervisor itself emits `engine.restarted` / `engine.failed` (3 crashes in 60 s).
- Not verified: Windows (CREATE_NO_WINDOW path, `awp-engine.exe` kill test) and a release bundle; only Linux dev was exercised. Killing the engine in dev restarts it (checked by hand).

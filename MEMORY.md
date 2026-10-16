# MEMORY

## Phase 0
- Toolchain: Bun 1.4, Rust stable, Biome (config scoped to apps/packages/registry/assets; never run it over `.claude/`).
- Dev in WSL2: `bun run dev` prints libEGL/MESA/ZINK warnings. These are WSL GPU noise, not app errors.
- Root `dev` runs `tauri dev` from `apps/desktop`; `beforeDevCommand` is that package's `vite` script.
- `engine:build` is a stub until Phase 2. `csp` is null in tauri.conf.json: harden later.
- CI runs `bun run check`, then `cargo fmt --check`, clippy and `cargo test` on windows-latest and macos-latest.

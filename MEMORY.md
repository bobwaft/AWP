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

## Phase 3
- `AgentEvent`/`RunRequest` zod live in `packages/protocol/src/agent.ts`. RPC: `agent.run {prompt,cwd,adapter,model?,fixture?}` → `{runId}`, `agent.stop`; events stream as `run.event`. Server now passes the zod-*parsed* params to handlers (defaults apply).
- Claude stream-json facts (CLI 2.1.301): `system/init` has session_id+model; tool calls are `assistant` content `tool_use`; results are `user` content `tool_result`; final `result` has `usage` + `total_cost_usd`. Prompt is passed after `--` (tool lists would swallow it). `claude auth status` prints JSON with `loggedIn`. Parser: `adapters/claude-parse.ts` (pure; file_change is derived from successful Write/Edit calls).
- Fixtures `packages/engine/test/fixtures/claude-*.jsonl` are real transcripts (haiku), slimmed + scrubbed (paths → /work/project, user name, ids). FakeAdapter replays them through the real parser. The write fixture contains a denied Bash call, a realistic case.
- Stop: POSIX uses a detached process group + SIGTERM then SIGKILL after 2 s; Windows uses `taskkill /T /F`. Windows path is unverified.
- Dev screen: command palette → "Dev: run prompt". Verified a real Claude run through the engine over stdio (events streamed, done success). Stop was verified only on Fake + a process-tree unit test, not on a live Claude run.
- Tauri `invoke` of `agent.run` isn't covered by a UI-level test; `useRun` buffers events that arrive before the runId is known.

## Phase 4
- Detection (`packages/engine/src/setup.ts`) takes an injectable `Runner`, so tests never shell out. States: missing / needs_signin / outdated (Claude outside the tested range 2.1.x) / ready. Claude account+plan come from `claude auth status` JSON (`email`, `subscriptionType`). Windows: PATH is rebuilt from the registry via `reg query` (machine then user, %VARS% expanded) and passed to detection and to new PTY tabs (`setup.freshEnv`). Registry path is covered by a unit test with fake `reg` output only; not run on real Windows.
- Fix list is in `packages/protocol/src/setup.ts` (`FIXES`, per OS). Commands there are guesses to verify on Windows/macOS: `winget install --id Git.Git -e`, `irm https://claude.ai/install.ps1 | iex`, `curl -fsSL https://claude.ai/install.sh | bash`, `brew install gh`, `pip install semgrep`.
- PTY: `portable-pty` 0.9 (ConPTY on Windows). Commands `pty_spawn/write/resize/kill` are UI-only; `engine.rs` must never mention "pty" (Rust test enforces it) and the engine's callback handler only answers `secret.get`. Event names `pty://data/<id>`, `pty://exit/<id>`. Output is buffered per tab in `lib/terminal.tsx` so tabs replay when they mount. Output arriving between `pty_spawn` returning and `listen` registering can be lost.
- Keychain: `keyring` 3 (`linux-native` = kernel keyutils, not persistent across reboot on Linux; fine because Windows/macOS are the targets). Keys `awp/<service>/<account>`; names (never values) are listed in app-data `accounts.json`. Engine reads secrets via outbound RPC `secret.get` (`outbound.ts`); only `awp/` keys are served. Nothing calls `getSecret` yet; Phase 6/7 inject the Figma token into MCP config env.
- Engine now handles requests concurrently (no queue), replies are matched by id.
- Terminal ANSI palettes are hand-picked, not AA-verified. The drawer's drag handle is pointer-only (no keyboard resize). `Ctrl+\`` toggles the drawer; Setup shows the terminal inline and hides the drawer.
- Not verified here: a live PTY session in the running app (no display in this environment), Windows/macOS detection.

# AWP — Implementation Plan

**For:** Claude Code building AWP from an empty repo.
**Inputs:** `PRD.md`, `DESIGN.md`, `ARCHITECTURE.md` (source of truth, at the repo root), this file (build order).
**Method:** 16 phases, one v1.0 release at the end. Each phase is built unattended, verified, committed, then **stops** for the human to test. AWP is built the same way AWP builds projects.
**Scope (PRD v0.2):** Claude Code only, greenfield only, all ten stages, 3D rifle included. Codex and brownfield are after v1.

---

## How to run a phase

- Use the `run-phase` skill ("run phase N" / "continue the phase"). Agent rules and the definition of done live in `CLAUDE.md`.
- Each phase's tasks are `- [ ]` TODOs, ticked off as they land. "You test" items are ticked by the human.
- Report failures in chat. They go to `BUGS.md`. When everything passes, say `Phase N passed. Start Phase N+1.`
- Primary dev machine: native Windows. macOS is verified in CI and with a manual pass before release.

## Conventions

- **Package manager / runtime:** Bun (workspaces). Rust stable via rustup.
- **Scripts (root `package.json`):** `dev` (Tauri dev), `check` (typecheck + lint + test), `build` (engine binaries + Tauri bundle), `engine:build`.
- **Lint/format:** Biome for TS; `cargo fmt` + `clippy` for Rust.
- **Types:** strict TypeScript; all cross-process payloads defined once as zod schemas in `packages/protocol`.
- **Naming:** files kebab-case, React components PascalCase, RPC methods `noun.verb`.
- **Commits:** one per phase plus fix commits; no unrelated refactors inside a phase.
- **Errors:** engine returns JSON-RPC errors with stable `code` strings (`AGENT_NOT_FOUND`, `GATE_BLOCKED`, …); UI shows them as toasts with a fix hint.

## Phase overview

| # | Phase | Main output | Depends on |
|---|---|---|---|
| 0 | Monorepo scaffold | Tauri + React + Bun workspaces running | — |
| 1 | App shell + design system | Tokens, layout, stage rail, 2D rifle diagram | 0 |
| 2 | Engine sidecar + protocol | Supervisor, JSON-RPC, typed client | 0 |
| 3 | Claude adapter + run stream | Claude/Fake adapters, AgentRunStream UI | 2 |
| 4 | Setup stage | Detection, keychain, account connections | 3 |
| 5 | Projects, git, state machine | Create/open, `.awp/state.json`, dashboard | 2 |
| 6 | Spec engine + Ideation | AWP MCP server, prompt library, chat + live spec, critic gate | 3, 5 |
| 7 | Design stage | Uploads, theme proposals, previews, tokens | 6 |
| 8 | Planning stage | Stack options, ARCHITECTURE.md, PHASES.md | 6 |
| 9 | Registry + Connectors | Registry, suggestions, installs, MCP config writer | 6 |
| 10 | Model routing | Task type → model tier, subagent files | 3, 4 |
| 11 | Phase runner + Testing | Execute/verify/review/commit, checklist, bugs, fix loop | 8, 9, 10 |
| 12 | Security stage | Scanners, AI review, licenses, legal drafts, report | 11 |
| 13 | Polish + Ship | Revisions, README/CHANGELOG, tag, GitHub release | 11 |
| 14 | 3D rifle scene | R3F scene, camera presets, bullet journey, fallback logic | 1, 5 |
| 15 | Packaging + release | Signed builds, updater, docs, v1.0.0 | all |

## Phase 0 — Monorepo scaffold
**Goal:** an empty Tauri 2 app that runs on Windows and macOS from one repo.

- [x] Bun workspaces: `apps/desktop`, `packages/engine`, `packages/protocol`, `packages/prompts`, `registry/`, `assets/3d/`.
- [x] Tauri 2 + React 19 + Vite + TypeScript (strict) in `apps/desktop`; Tailwind v4.
- [x] Biome, Vitest, root scripts (`dev`, `check`, `build`), `.gitignore`, `.editorconfig`.
- [x] GitHub Actions: `check` on push/PR for windows-latest and macos-latest.
- [x] Empty `MEMORY.md`, `BUGS.md`; MIT `LICENSE`.

**Done when:** `bun install && bun run dev` opens a window titled "AWP"; `bun run check` passes; CI green on both OSes.

**You test**
- [x] App window opens on your Windows machine.
- [x] `bun run check` passes locally.

## Phase 1 — App shell + design system
**Goal:** the 2D frame of the app, matching DESIGN.md.

- [x] `src/styles/tokens.css` + `tokens.json` from DESIGN.md §4; Geist Sans/Mono bundled locally.
- [x] Light theme token values designed with Impeccable per DESIGN.md §4.0 (AA-checked), recorded in DESIGN.md §4.1; `ThemeSwitch` (System / Dark / Light) with `data-theme`.
- [x] Layout: top bar, collapsible `StageRail` (10 stages, states locked/current/done/stale, keys 1–0), main area, right panel slot.
- [x] Base components: Button, Input, Chip, Card, Tabs, Toast, Dialog, `CommandPalette` (Cmd/Ctrl+K).
- [x] `RifleDiagram2D` (SVG, original drawing) with 10 clickable hotspots and state styles.
- [x] Settings screen skeleton with Display options (3D / 2D / Reduced motion) stored in `settings.json`.
- [x] Mock data store to drive stage states until the engine exists.

**Done when:** all views render with mock data; keyboard navigation works; focus rings visible; contrast meets AA.

**You test**
- [x] Stage rail switches stages by click and keys 1–0.
- [x] Hotspots on the 2D rifle open the matching stage.
- [x] Command palette opens and jumps to a stage.
- [x] The look matches DESIGN.md (colors, type, spacing).
- [x] Switch System / Dark / Light; both themes read well, and System follows your Windows setting.

## Phase 2 — Engine sidecar + protocol
**Goal:** UI talks to a bundled TypeScript engine through Rust.

- [x] `packages/protocol`: zod schemas for JSON-RPC envelope, methods and notifications from ARCHITECTURE.md §4 (stubs allowed for later phases).
- [x] `packages/engine`: NDJSON JSON-RPC server on stdio; `ping`, `version` methods; structured logging to app-data `logs/`.
- [x] `bun build --compile` per target triple → `apps/desktop/src-tauri/binaries/`; `bundle.externalBin` configured.
- [x] Rust engine supervisor: spawn on launch, restart policy (3 in 60 s), `invoke("engine_request")`, `engine://event` emits.
- [x] `src/lib/engine.ts` typed client; dev mode can run the engine with `bun run` instead of the binary.

**Done when:** UI shows engine version from a real round-trip; killing the engine process triggers restart and a toast.

**You test**
- [x] Settings → About shows the engine version.
- [x] Kill `awp-engine` in Task Manager: app recovers and tells you.

## Phase 3 — Claude adapter + run stream
**Goal:** run a prompt through Claude Code and watch it live.
- [x] `AgentAdapter` interface and `AgentEvent` union (ARCHITECTURE.md §3.3), kept agent-agnostic for a later Codex adapter.
- [x] `ClaudeCodeAdapter` (`claude -p --output-format stream-json --verbose`, resume, stop) with `--help` version probe and tested version range.
- [x] `FakeAdapter` replaying fixtures; record 3+ real transcripts into `test/fixtures/` (scrub secrets).
- [x] Golden-file parser tests.
- [x] Process-tree stop on Windows (job objects / tree-kill) and macOS.
- [x] `AgentRunStream` component: messages, tool calls, file changes, commands, usage, Stop button, model badge.
- [x] Hidden dev screen: "Run prompt".

**Done when:** a dev prompt runs end-to-end on Claude Code and on FakeAdapter; Stop ends the run within 5 s.

**You test**
- [x] Run "list the files in this folder" with Claude Code; events stream in.
- [x] Stop mid-run works.

## Phase 4 — Setup stage
**Goal:** the user connects Claude Code and accounts, using AWP's built-in terminal.

- [x] `setup.detect`: claude, git, gh, semgrep (installed, version, logged in where checkable).
- [x] Rust PTY (`portable-pty`, ConPTY on Windows; confirm crate) with `pty_spawn/write/resize/kill` and `pty://data|exit` events (ARCHITECTURE.md §3.1).
- [x] `TerminalDrawer` (xterm.js, tabs, resize, `` Ctrl+` ``, "Open Claude Code here") available on every screen.
- [x] Setup view per DESIGN.md §3.5: Required/Optional groups, `SetupCard` states, "Fix in terminal" in a new named tab from the built-in fix list (never presses Enter), "Do it manually", 3 s polling while waiting + re-check on exit, account/plan on ready.
- [x] Windows PATH refresh from the registry in detection; fresh env for new tabs.
- [x] Test: no engine/MCP code path can call `pty_write`.
- [x] Keychain commands in Rust; engine secret access via RPC.
- [x] Account connections: GitHub (via `gh auth status`, or token stored in keychain), Figma (token for its MCP), generic "add token" for registry items.
- [x] Block continuing until Claude Code (logged in) and git are available.

**Done when:** detection is correct on Windows and macOS; tokens survive restart and never appear in any file.

**You test**
- [x] Setup shows the right status for each tool you have.
- [x] Rename `claude` temporarily: Setup reports it missing; "Fix in terminal" types the install command in a new tab; after it runs, the card turns ready **without restarting AWP**.
- [x] Sign out of Claude Code, then sign in via Fix in terminal (`/login`): the card updates while the session is still open and shows your account.
- [x] Open the terminal with `` Ctrl+` `` on any screen; run an interactive program (e.g. `claude`) and resize the drawer.
- [x] Add a Figma token, restart AWP, it is still connected; search your disk/repo for it — not found.

## Phase 5 — Projects, git, state machine
**Goal:** create and reopen projects with persistent state.

- [x] `project.create` (folder + `git init` + project layout from ARCHITECTURE.md §5 + generated CLAUDE.md), `project.open`, `project.list`.
- [x] Orchestrator: stage statuses, unlock rules, stale propagation, critic-round counter, override-with-reason; persisted to `.awp/state.json` after every change.
- [x] Git service: branch `awp/build`, commit, tag, diff stats, clean-tree check.
- [x] Dashboard: recent projects with stage, phase progress, last activity, open bugs.
- [x] Spec file watcher → `spec.changed` events.

**Done when:** state survives restart; stale propagation unit-tested; git ops work in temp repos in tests.

**You test**
- [x] Create a project; folder has the expected files.
- [x] Quit and reopen: you land on the same stage.

## Phase 6 — Spec engine + Ideation
**Goal:** the interview → synthesize → critique loop, producing PRD.md.

- [x] AWP MCP server inside the engine binary (`awp-engine mcp`): `ask_user`, `request_form`, `submit_critique`, `remember`, `approve_permission` (others stubbed for later phases).
- [x] Forms: `FormField` schema subset + zod validation, `packages/prompts/forms/` templates (`feature_spec`, `stack_constraints`, `bug_report`; `design_schema` in Phase 7) with `fills` mapping, `form.*` RPCs, drafts in `.awp/forms/`.
- [x] `InputDock`, `FormCard`, `FormSummaryCard` per DESIGN.md §3.2 and §3.5: AI-filled markers, "Not sure, help me" → suggestion or open question, "Ask about this form" round-trip, decline memory (`FORM_DECLINED`), Edit prefills from the current spec, "Continue this form" after an interrupted run.
- [x] Interviewer prompt rules: form only for 3+ field shapes, `ask_user` for single questions, max one form per turn, prefill from earlier answers.
- [x] Per-run MCP config generation including the AWP server; `--permission-prompt-tool` wiring.
- [x] Prompt library format + loader + per-project overrides; prompts: `ideation.interviewer`, `ideation.synthesizer`, `ideation.critic`.
- [x] PRD required-section schema; readiness scoring (informational).
- [x] Gate per PRD §5.2.1: enabled at zero blocking; user confirms; max 3 critic rounds, then "Complete anyway" with reason.
- [x] Ideation view: `ChatPanel` (attachments, quick-reply chips), `SpecPanel` (CodeMirror edit/preview/diff, accept/reject AI hunks, read-only while the agent writes), `QuestionList`, `ReadinessReticle`, Complete stage button.

**Done when:** a full Ideation run on FakeAdapter reaches zero blocking questions and completes in tests; the round cap is tested; a real run produces a usable PRD.md.

**You test**
- [x] Describe a small app; AWP asks focused questions with clickable choices.
- [x] PRD.md updates live; your manual edits are kept.
- [x] Complete stage is disabled while blocking questions exist.
- [x] After 3 critic rounds with blockers left, you can complete with a reason.
- [x] AWP asks for a feature as a form, prefilled from what you said; you fill it, it lands in PRD.md.
- [x] Mark a required field "Not sure": it shows up as an open question. Ask a question about the form: the draft survives.
- [x] "Answer in chat instead" works, and AWP doesn't immediately re-offer the same form. A half-filled form survives switching stages.

## Phase 7 — Design stage
**Goal:** DESIGN.md with tokens from the user's taste and references.

- [x] Uploads (images, PDFs, sketches) copied to `docs/design/refs/`; URLs and Figma links accepted.
- [x] `submit_themes` tool; prompts `design.interviewer`, `design.themer`, `design.critic`.
- [x] `design_schema` form template: color pickers with contrast readout, font picker with pairing preview, density/radius/motion sliders, references. Opens only after a theme is picked, prefilled with it.
- [x] `ThemeCard` grid with live preview (sample components rendered with each theme's tokens in an isolated iframe).
- [x] Pick/mix theme → DESIGN.md + `docs/design/tokens.json`.
- [x] If Figma is connected, the themer may read the linked file through the Figma MCP.

**Done when:** themes render as real previews; picked theme writes valid tokens; design gate works.

**You test**
- [x] Upload two inspiration images; themes reflect them.
- [x] Preview shows buttons, inputs, cards in each theme.
- [x] DESIGN.md and tokens.json match the theme you picked.

## Phase 8 — Planning stage
**Goal:** ARCHITECTURE.md and PHASES.md the phase runner can execute.

- [x] `submit_stack_options`, `submit_phase_plan` tools; prompts `planning.architect`, `planning.phaser`, `planning.critic`.
- [x] `StackOption` comparison view; pick/edit → ARCHITECTURE.md (must include verify commands: install, typecheck, lint, test, build).
- [x] PHASES.md format: per phase id, title, goal, tasks, files, acceptance criteria, test checklist, UI tag; parser + validator.
- [x] `PhaseBarrel` preview of the plan; reorder/split/merge phases.

**Done when:** PHASES.md round-trips through the parser; validator rejects phases without acceptance criteria.

**You test**
- [x] You get 2–3 stack options with clear trade-offs.
- [x] Phases are small and each has a test checklist.
- [x] Editing PHASES.md by hand still parses.

## Phase 9 — Registry + Connectors
**Goal:** suggest, approve, and install skills, MCPs, libraries, tools.
**Blocked by:** owner-verified registry seed list.

- [ ] `registry/registry.json` schema + seed entries (each with source, pinned SHA, license, verified by the owner).
- [ ] Fetch + cache + bundled fallback; install by pinned SHA with tree-hash check and file preview.
- [ ] Writers: `.claude/skills/`, `.mcp.json` (with `${VAR}`).
- [ ] On Planning completion, run `claude-code-setup`'s recommender (headless) against the specs and scaffold; parse its recommendations into registry-shaped items.
- [ ] Merge recommender output with registry matches: registry items verified, recommender-only items "unverified"; at most one suggestion per overlap group by default.
- [ ] `submit_suggestions` tool + `connectors.suggester` prompt; `SuggestionCard` approve/reject; account prompts for items needing tokens.
- [ ] `docs/TOOLING.md` generation; AWP-native skills (`awp-interview`, `awp-phase-runner`, `awp-test-checklist`, `awp-security-review`) in `registry/skills/`.
- [ ] User-added items by repo URL or local folder, flagged "unverified".

**Done when:** approved items land in the right folders; rejected items are recorded and not re-suggested.

**You test**
- [ ] Suggestions fit your PRD/design/stack and explain why.
- [ ] Approve a skill and an MCP; files appear in the project; secrets are not in `.mcp.json`.
- [ ] Claude Code sees the installed skill (ask it to list skills).

## Phase 10 — Model routing
**Goal:** pick the right model tier for every task.

- [ ] Routing table task type → tier, tier → model mapping (ARCHITECTURE.md §7).
- [ ] Settings UI: global routing table, tier → model mapping; per-project override file.
- [ ] Generate `.claude/agents/*.md` subagents with tier-mapped models.
- [ ] Route all existing stage calls through the router; log decisions; model badge in UI.

**Done when:** unit tests cover defaults and overrides; every run shows its model badge.

**You test**
- [ ] Change a task type's tier in Settings; the next run uses the new model.

## Phase 11 — Phase runner + Testing
**Goal:** build the user's project phase by phase with human test gates.

- [ ] Runner steps 1–8 from ARCHITECTURE.md §6: prepare, execute, verify (3 retries), fresh-context review, gitleaks pre-commit check, commit + tag, checklist, fix loop, gate.
- [ ] Tools: `report_phase_result`, `log_bug`, `update_bug`; prompts `impl.executor`, `impl.verifier`, `impl.reviewer`, `impl.fixer`, `test.checklist`.
- [ ] MEMORY.md maintenance via `remember`.
- [ ] Implementation + Testing view: `PhaseBarrel`, `AgentRunStream`, `TestChecklist` (Pass/Fail, notes, screenshot), `BugCard`s; defer-with-reason; failing an item opens the `bug_report` form prefilled with that item's steps and expected result.
- [ ] Rollback to `awp/phase-N` with confirmation.
- [ ] Usage tracking per phase.
- [ ] Execution modes (PRD §5.6): `ModeSwitch`, `phase.setMode`, One-shot loop (phases → `built`, combined grouped checklist, fixes committed against the owning phase), halt conditions, resume after halt.

**Done when:** FakeAdapter integration tests run 2 phases in each mode, Phased including a failed test and a fix, and One-shot including a verify-failure halt and a resume; a real run builds a small app.

**You test**
- [ ] Run Phase 1 of a sample project; it commits and tags.
- [ ] Fail one checklist item; a bug appears in BUGS.md; the fix run re-tests only that item.
- [ ] Roll back to the previous phase; code and state match.
- [ ] Run a 3-phase sample in One-shot: it builds all phases without stopping, then shows one checklist grouped by phase.
- [ ] From here on, dogfood: build one real side project with AWP and log findings in BUGS.md.

## Phase 12 — Security stage
**Goal:** a clear report and fixes before shipping.

- [ ] Download pinned gitleaks + osv-scanner with checksum verification; semgrep if on PATH.
- [ ] Normalize findings; `security.reviewer` AI pass; de-duplicate; severity sort.
- [ ] License scan → `LICENSE` (per user choice) + `THIRD_PARTY_NOTICES.md`; flag incompatible licenses.
- [ ] If PRD mentions user data: draft privacy policy + terms marked "not legal advice — review before publishing".
- [ ] `docs/SECURITY_REPORT.md`; `FindingRow` list; accept fixes → runs as a security phase through the runner.
- [ ] Safety-catch state flips when report is clean or all findings accepted/deferred.

**Done when:** a fixture repo with a planted secret, a vulnerable dependency, and a GPL dependency produces all three findings.

**You test**
- [ ] Plant a fake API key in a test project; Security finds it.
- [ ] Report reads clearly; accepted fixes run and re-scan clean.

## Phase 13 — Polish + Ship
**Goal:** final revisions and a tagged release.

- [ ] Polish: project summary, revision requests as mini-phases (reuse runner with a short checklist).
- [ ] Ship: README + CHANGELOG generation from specs and commits; version prompt; `git tag vX.Y.Z`; optional `gh` push + release.
- [ ] Ship summary card: phases, commits, tokens/cost, bugs fixed.

**Done when:** a sample project goes from Polish to a GitHub release (in a test repo).

**You test**
- [ ] Ask for a small revision; it is built, committed, and quick-tested.
- [ ] Ship creates the tag and (optionally) a GitHub release with notes.

## Phase 14 — 3D rifle scene
**Goal:** the 3D navigator and bullet journey from DESIGN.md §2.
- [ ] Blender MCP set up for this repo: Blender add-on installed on the Windows machine, `.mcp.json` entry for the server, connection verified. Allowed asset sources per DESIGN.md §2.1.
- [ ] Original rifle + target `.glb` built by Claude via Blender MCP (named nodes, `barrel_path` spline; ≤ 5 MB, ≤ 80k tris, Draco). Commit the `.blend` source and `assets/3d/SOURCES.md`.
- [ ] Sound set (DESIGN.md §9): free-use files in `assets/audio/` with `SOURCES.md`; Settings toggle, off by default.
- [ ] `RifleScene` with R3F + drei: lighting, hotspots bound to stage state, lazy load after first paint.
- [ ] `cameraPresets.ts` for 10 stages; GSAP transitions (1.2 s, skippable).
- [ ] Stage moments from DESIGN.md §2.2 (case assembly, chambering, scope push-in, bipod, rail attachments, barrel follow-cam, scope check, safety catch, muzzle, ship shot).
- [ ] 15% dimmed scene behind work panels.
- [ ] GPU tier detection, fps watchdog (< 45 fps for 3 s → offer 2D), reduced-motion handling, OS preference.

**Done when:** 60 fps on an integrated-GPU laptop at 1440×900; 2D fallback triggers correctly; no asset from any game.

**You test**
- [ ] Click each hotspot; the camera flies to the right part; any key skips.
- [ ] Bullet advances along the barrel as phases pass.
- [ ] Ship plays the shot and hit.
- [ ] Turn on Reduced motion; flights become fades.

## Phase 15 — Packaging + release
**Goal:** installable, updatable AWP v1.0.0.

- [ ] Release workflow with tauri-action: Windows MSI/NSIS, macOS DMG (arm64 + x64); signing/notarization when secrets exist.
- [ ] Updater via GitHub Releases manifest.
- [ ] Opt-in contract-test workflow against the real `claude` CLI.
- [ ] User docs: install, first project walkthrough, registry contribution guide, privacy statement.

**Done when:** fresh install on clean Windows and macOS machines completes a sample project end-to-end; update from v1.0.0-rc to v1.0.0 works.

**You test**
- [ ] Install from the release on Windows and macOS.
- [ ] Complete a tiny project from Setup to Ship.
- [ ] Auto-update prompt appears for a newer test release.

## Decisions needed before or during the build

| Needed by | Decision | Status |
|---|---|---|
| Phase 0 | Open-source license | Done: MIT |
| Phase 3 | Provider terms | Done: AWP is a wrapper around the user's own Claude Code; re-read terms before public release |
| Phase 1 | Light theme | Done: in v1; values designed with Impeccable in Phase 1 |
| Phase 4, 6 | Intent pass on terminal-in-Setup and the form input dock | Done: DESIGN.md §3.5 (wireframes optional) |
| Phase 7 | Claude Code is in Figma's MCP Catalog | Done: confirmed by owner |
| Phase 9 | claude-code-setup run headless | Done: approved; verified by the Phase 9 TODO |
| Phase 9 | Registry seed list (Claude drafts, owner verifies) | Drafted in REGISTRY.md; owner verification checklist open |
| Phase 10 | Default model-tier table | Done: code/tests/review → Sonnet, architecture/deep thinking → Opus, lookups → Haiku (ARCHITECTURE.md §7) |
| Phase 11 | One-shot vs phased | Done: user chooses per run (PRD §5.6) |
| Phase 14 | Who builds the rifle model; sound effects | Done: Claude via Blender MCP; free-use sounds, off by default |
| Phase 15 | App name | Done: AWP, no fallback (free, not sold) |
| Phase 15 | Code-signing certificates (Windows, Apple) | Deferred: v1 may ship unsigned; updater signing key still needed |

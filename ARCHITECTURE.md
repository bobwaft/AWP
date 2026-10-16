# AWP — Architecture

**Summary:** a Tauri 2 desktop app (Rust shell + React UI) that owns a bundled TypeScript **engine** sidecar. AWP is a **wrapper** around the user's own Claude Code. The engine runs the stage state machine and the prompt library, and an adapter starts the user's installed `claude` CLI (headless `-p` runs) under the user's own login. The Rust core also hosts a PTY terminal, so the user can run `claude` and other tools interactively inside AWP. v1 ships Claude Code only; the adapter interface is kept so a Codex adapter can be added after v1. All project specs and state live as files in the user's repo.

---

## 1. System overview

```
┌───────────────────────────── AWP desktop app ─────────────────────────────┐
│                                                                           │
│  React UI (WebView)                                                       │
│   ├─ 3D scene (R3F) / 2D fallback                                         │
│   ├─ Stage views: chat, spec panel, phase runner, tests, security        │
│   └─ Zustand stores  ◄── events ──┐                                       │
│            │ invoke               │ emit                                  │
│            ▼                      │                                       │
│  Rust core (Tauri 2)              │                                       │
│   ├─ Window, menus, updater       │                                       │
│   ├─ Keychain (keyring crate)     │                                       │
│   ├─ PTY terminal (portable-pty)  │  ◄── xterm.js in UI                   │
│   ├─ Engine supervisor ───────────┘  JSON-RPC 2.0 over stdio (NDJSON)     │
│   └─ Scoped fs / dialogs                │                                 │
│                                         ▼                                 │
│  Engine sidecar (TypeScript, compiled with Bun)                           │
│   ├─ Orchestrator (stage state machine, gates)                            │
│   ├─ Spec engine (interview → synthesize → critique)                      │
│   ├─ Phase runner + test loop                                             │
│   ├─ Router (task type → model tier)                                      │
│   ├─ Agent adapters: ClaudeCodeAdapter, FakeAdapter (Codex after v1)      │
│   ├─ AWP MCP server (callbacks from agents: ask_user, submit_*, ...)      │
│   ├─ Registry (skills, MCPs, libraries, tools)                            │
│   ├─ Security runner (gitleaks, osv-scanner, semgrep, AI review)          │
│   └─ Git service (git / gh CLI)                                           │
│              │ spawn                                                      │
└──────────────┼────────────────────────────────────────────────────────────┘
               ▼
   User's `claude` CLI  ──►  their own subscription or API key
               │
               ▼
   User's project repo (specs, code, .awp/ state)
```

## 2. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2 | Small binaries, native webview, Rust for OS integration |
| Targets | Windows 10/11 x64, macOS 13+ (arm64, x64) | v1 scope; Linux later. Primary dev machine is native Windows; macOS through CI |
| UI | React 19 + TypeScript + Vite | Ecosystem for R3F, CodeMirror, GSAP |
| Styling | Tailwind CSS v4 + CSS variables from DESIGN.md tokens | Tokens shared with 3D scene |
| State (UI) | Zustand | Simple, no boilerplate |
| 3D | three.js via @react-three/fiber + @react-three/drei; GSAP for camera timelines | Declarative scene, proven stack |
| Editor | CodeMirror 6 (Markdown) | Lighter than Monaco; good diff/merge extension |
| Terminal | xterm.js (+ fit, web-links addons) in the UI; PTY via the `portable-pty` crate in Rust (ConPTY on Windows) | Real interactive shell; the PTY is OS integration, so it lives in Rust. Crate choice to be confirmed in Phase 4 |
| Structured input | Forms rendered from a restricted JSON Schema subset sent by the agent (`request_form`), validated with zod | One renderer for template and ad-hoc forms; schema-validated answers |
| Themes | Light + dark token sets, `data-theme` on `<html>`, default follows the OS | Light theme is in v1 |
| Engine runtime | TypeScript compiled to a single binary with `bun build --compile`, shipped as a Tauri sidecar (`externalBin`) | Agents/MCP tooling is TS-first; no Node install required |
| Engine ↔ Rust | JSON-RPC 2.0, newline-delimited over the sidecar's stdio | Simple, debuggable, no ports |
| Agent integration | Spawn the user's installed CLI headlessly: `claude -p --output-format stream-json` | Auth stays with the user's CLI; no AWP-held credentials |
| Structured agent output | Agents call tools on a local **AWP MCP server** whose input schemas define the output | Agent-agnostic (ready for Codex later); validated by schema |
| Persistence | Files in the repo (`docs/`, `MEMORY.md`, `BUGS.md`, `.awp/`); app-level JSON in the OS app-data folder | Specs are files (PRD principle 2); no database needed |
| Secrets | OS keychain via the `keyring` crate; injected as env vars at agent spawn | Never written to disk or repo |
| Git / GitHub | Shell out to `git` and `gh` | Simplest valid method; users already have them |
| Updates | tauri-plugin-updater against GitHub Releases | Free, works with open source |

## 3. Components

### 3.1 Rust core (`apps/desktop/src-tauri`)
- **Engine supervisor:** spawns `awp-engine` at launch, restarts on crash (max 3 in 60 s, then shows an error), forwards JSON-RPC requests from `invoke("engine_request")` and emits engine notifications to the UI as Tauri events (`engine://event`). Owning the sidecar in Rust keeps agent runs alive across webview reloads.
- **Keychain commands:** `secret_set(key, value)`, `secret_get(key)` (engine-only, via an RPC the engine calls back on), `secret_delete(key)`. Keys are namespaced `awp/<service>/<account>`.
- **PTY terminal:** commands `pty_spawn({ cwd, shell?, cols, rows }) → ptyId`, `pty_write(ptyId, data)`, `pty_resize(ptyId, cols, rows)`, `pty_kill(ptyId)`. Output streams as `pty://data/<ptyId>` events, and exit as `pty://exit/<ptyId>` with the exit code, which Setup uses to re-check detection. The default shell is PowerShell (`pwsh` if present, else `powershell.exe`) on Windows and `$SHELL -l` on macOS. The terminal env is the user's normal env; keychain secrets are **not** injected. PTYs are killed on window close. Terminal I/O is not persisted. `pty_write` is callable **only from the UI**, for user keystrokes and AWP's built-in fix commands (`packages/protocol/setup-fixes.ts`, per OS). There is no engine or MCP path to a PTY, so agents can't type into a terminal.
- **Plugins:** dialog (pick folders/files), opener (open URLs/files), updater, window-state, single-instance.
- No business logic in Rust.

### 3.2 UI (`apps/desktop/src`)
- `scene/` — `RifleScene`, `RifleDiagram2D`, `cameraPresets.ts`, `useGpuTier`.
- `stages/` — one folder per stage with its view and hooks.
- `components/` — the component list in DESIGN.md §6.
- `stores/` — `projectStore`, `runStore` (live agent events), `settingsStore`.
- `lib/engine.ts` — typed client: `engine.call(method, params)`, `engine.on(event, handler)`; types from `packages/protocol`.

### 3.3 Engine (`packages/engine`)

**Orchestrator** — owns `.awp/state.json` and enforces gates.

```
Stage status: locked → active → complete → stale
                          ▲            │
                          └── reopen ──┘
```
- Completing stage N unlocks N+1.
- Editing a completed stage's spec marks every later completed stage `stale`; stale stages must be re-confirmed (AWP shows a "what changed upstream" summary).
- Implementation and Testing alternate per phase in Phased mode: `phase.status = pending → running → verifying → awaiting_test → fixing → passed | deferred`. In One-shot mode a phase goes `running → verifying → built` and the runner moves straight to the next phase. After the last phase, all `built` phases move to `awaiting_test` together.

**Spec engine** — used by Ideation, Design, Planning.
1. *Interviewer* turn: agent reads the current spec and chat, asks the next 1–3 most valuable questions via the `ask_user` MCP tool (with optional choices).
2. *Synthesizer* turn: agent edits the spec file directly (Edit tool scoped to that one file).
3. *Critic* turn: agent calls `submit_critique` with open questions (blocking / non-blocking) and per-section readiness scores against the stage's required-section schema.
4. Gate (PRD §5.2.1): `Complete stage` is enabled when blocking = 0, and the stage completes only on the user's click. Readiness is shown but never gates. The engine counts critic rounds per stage visit (`stages.<id>.criticRounds`). After round 3 it stops re-critiquing automatically and offers "Complete anyway" with a required reason, stored in `stages.<id>.override`.

**Phase runner** — see §6.

**Router** — maps a task type to a model tier (§7).

**Agent adapters** — one interface, two v1 implementations (`codex` reserved for after v1):

```ts
interface AgentAdapter {
  id: "claude" | "fake";            // "codex" added after v1
  detect(): Promise<{ installed: boolean; version?: string; loggedIn: boolean; models: string[] }>;
  run(req: RunRequest): AsyncIterable<AgentEvent>;   // streaming
  resume(sessionId: string, req: RunRequest): AsyncIterable<AgentEvent>;
  stop(runId: string): Promise<void>;
}

interface RunRequest {
  runId: string;
  cwd: string;                      // project root; agent confined here
  prompt: string;                   // rendered template
  systemAppend?: string;            // stage instructions
  model?: string;
  allowedTools?: string[];          // e.g. ["Read","Edit(docs/PRD.md)","Bash(npm test:*)"]
  mcpConfigPath?: string;           // includes the AWP MCP server
  env?: Record<string,string>;      // secrets injected here only
  maxTurns?: number;
}

type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "message"; role: "assistant"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "file_change"; path: string; kind: "add" | "edit" | "delete" }
  | { type: "command"; cmd: string; exitCode?: number }
  | { type: "usage"; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: "error"; message: string }
  | { type: "done"; status: "success" | "error" | "stopped" };
```

- **ClaudeCodeAdapter:** spawns `claude -p --output-format stream-json --verbose` with `--model`, `--allowedTools`, `--append-system-prompt`, `--mcp-config`, `--max-turns`, `--resume <session>`; parses each JSON line into `AgentEvent`. Tool-permission requests that fall outside `allowedTools` route to the AWP MCP server's `approve_permission` tool via `--permission-prompt-tool`, which surfaces an approval card in the UI.
- **CodexAdapter (after v1):** would spawn `codex exec --json` and pass MCP servers through Codex's `config.toml` `mcp_servers`. It is not built in v1. Keep the adapter interface and the MCP-based structured output agent-agnostic so it slots in later.
- **FakeAdapter:** replays recorded JSONL transcripts from `packages/engine/test/fixtures/`; used in all automated tests and for UI development without spending tokens.
- Exact flags are verified against the installed CLI version at startup (`--help` probe); each adapter declares a tested version range and warns outside it.

**AWP MCP server** — a stdio MCP server bundled inside the engine binary (`awp-engine mcp`), added to every agent run. Tools:

| Tool | Used by | Purpose |
|---|---|---|
| `ask_user` | Interviewer, executor | Ask a question (free text or choices); blocks until the user answers in the UI |
| `request_form` | Interviewer, any | Ask for structured input: `{ templateId? , title, fields?: FormField[], prefill? }`. Either a template (`feature_spec`, `design_schema`, `stack_constraints`, `bug_report`) or ad-hoc `fields`. Blocks until the user acts. Returns one of `{ status: "submitted", values, unsure: fieldId[] }`, `{ status: "declined" }` or `{ status: "question", text, draft }` ("Ask about this form"; the agent answers, then re-sends with `prefill: draft`). Prefilled values the agent supplies are flagged `aiFilled` until edited |
| `submit_critique` | Critic | Open questions + readiness scores (schema-validated) |
| `submit_themes` | Design | 2–3 theme proposals with tokens |
| `submit_stack_options` | Planning | Stack options with trade-offs |
| `submit_phase_plan` | Planning | Phases with tasks, acceptance criteria, test checklist |
| `submit_suggestions` | Connectors | Registry item IDs + reasons |
| `report_phase_result` | Executor, verifier | What was built, checks run, known issues |
| `log_bug` / `update_bug` | Testing, fixer | Writes BUGS.md entries |
| `remember` | Any | Appends a durable fact to MEMORY.md |
| `approve_permission` | Claude permission prompt | Forwards out-of-policy tool use to the user |

**Forms** — `FormField` is a restricted schema: `{ id, label, help?, required?, type }` where `type` is one of `text | longtext | number | boolean | select | multiselect | color | font | file | url | list` (`list` = a repeatable group of sub-fields, e.g. acceptance criteria), with `options`, `min`/`max` and `pattern` where they apply. The engine rejects anything outside this subset and the agent gets a schema error back. Form templates live in `packages/prompts/forms/<templateId>.json`. Each template field declares which spec section it fills (`fills: "prd.features"`), so readiness scoring and the synthesizer use the same map. Drafts are saved to `.awp/forms/<formId>.json` until submitted. If the run ends while a form is pending, the draft is kept and offered as "Continue this form"; its submission is sent to the next run as a structured user message. "Not sure" fields that fill a required section become blocking open questions in the critic's input. The engine refuses a second `request_form` for a template the user declined during the current stage visit (error `FORM_DECLINED`), and caps forms at one per interview turn.

**Prompt library** (`packages/prompts`) — templates per stage and role (`interviewer`, `synthesizer`, `critic`, `executor`, `verifier`, `fixer`, `reviewer`), each a Markdown file with front matter (`id`, `version`, `taskType`, `requiredTools`) and Handlebars-style variables. Required-section schemas per spec live beside them (`schemas/prd.sections.json`, etc.). Per-project overrides in `.awp/prompts/<id>.md` take precedence.

**Registry** (`registry/registry.json` in the AWP repo, fetched and cached; bundled snapshot as fallback):

```json
{
  "id": "gsap-skill",
  "kind": "skill",                       // skill | mcp | library | tool
  "name": "GSAP",
  "source": { "repo": "https://github.com/<owner>/<repo>", "path": "skills/gsap", "sha": "<pinned commit>" },
  "license": "MIT",
  "agents": ["claude", "codex"],
  "stages": ["design", "implementation"],
  "tags": ["animation", "web"],
  "requires": { "accounts": [], "env": [] },
  "summary": "Animation patterns and API guidance for GSAP."
}
```
- Install = download at the pinned SHA, verify the tree hash, show the skill's files to the user, then copy into `.claude/skills/<id>/`.
- MCP items write into `.mcp.json` (env vars referenced as `${VAR}`).
- v1 only suggests entries whose `agents` include `claude`. The field stays so Codex can use the same registry later.
- Libraries are recorded in `docs/TOOLING.md`; the executor installs them during the relevant phase.
- Registry entries carry a `group` (overlap group, see REGISTRY.md) and `kind` distinguishes `skill | plugin | mcp | connector | library | tool`. Plugins install via the Claude Code plugin marketplace (`/plugin marketplace add` + `/plugin install`, recorded in `.claude/settings.json` `enabledPlugins`) rather than by copying files.

**Project-tailored discovery** — on Planning completion the orchestrator runs a `discovery` task (fast tier for scanning, balanced to rank) that invokes the `claude-code-setup` plugin's `claude-automation-recommender` skill in a headless `claude -p` run, with the plugin enabled for that run only. Its recommendations are normalized into registry-shaped items via `submit_suggestions` (`source: "recommender"`), merged with registry matches (`source: "registry"`), de-duplicated by repo URL and group, and shown in Connectors. Recommender-only items are flagged unverified. If the plugin is unavailable, AWP falls back to registry matching alone. The recommender is read-only (it prints install commands and never installs), so AWP does all installs after approval. The run must allow `WebSearch` and instruct the agent to report through `submit_suggestions` instead of prose.

**Security runner** — downloads pinned releases of gitleaks and osv-scanner into the app-data `tools/` folder on first use (checksum-verified); uses `semgrep` if on PATH, otherwise offers install instructions and continues. Outputs are normalized to `Finding { tool, severity, file, line, ruleId, message, fixHint }`, then an AI `reviewer` pass adds findings and de-duplicates. License data comes from osv-scanner's license scan plus manifest metadata.

**Git service** — `git init`, branch `awp/build`, commit, tag `awp/phase-N`, diff stats, rollback (`git reset --hard <tag>` only after explicit confirmation). `gh` for push and release when available.

## 4. Engine protocol (JSON-RPC 2.0)

Requests (UI → engine):

| Method | Params → Result |
|---|---|
| `setup.detect` | → `{ claude, git, gh, semgrep }`: per tool `{ state, version?, account?, plan? }`. On Windows, PATH is re-read from the registry (HKCU + HKLM `Environment`) before probing. The UI polls every 3 s while a fix tab is open |
| `project.create` | `{ path, name }` → `ProjectState` |
| `project.import` | *(after v1, brownfield)* `{ path \| gitUrl }` → `ProjectState` |
| `project.open` / `project.list` | → `ProjectState` / `ProjectSummary[]` |
| `stage.enter` / `stage.complete` / `stage.reopen` | `{ stage, overrideReason? }` → `ProjectState` |
| `chat.send` | `{ stage, text, attachments? }` → `{ runId }` |
| `question.answer` | `{ questionId, answer }` → `ok` |
| `form.submit` / `form.decline` / `form.saveDraft` | `{ formId, values? }` → `ok` |
| `spec.save` | `{ file, content }` → `ok` (user edits) |
| `design.pickTheme` | `{ themeId, tweaks? }` → `ok` |
| `plan.pickStack` | `{ optionId, edits? }` → `ok` |
| `registry.suggest` / `registry.decide` / `registry.install` | → suggestions / ok / install report |
| `phase.run` / `phase.stop` / `phase.rollback` | `{ phase, mode: "phased" \| "oneshot" }` → `{ runId }` / ok / ok |
| `phase.setMode` | `{ mode }` → `ok` (takes effect after the current phase) |
| `test.submit` | `{ phase, results: [{ itemId, pass, notes, screenshot? }] }` → `ok` |
| `security.run` / `security.acceptFixes` | → `{ runId }` |
| `ship.release` | `{ version, push, githubRelease }` → release info |
| `routing.get` / `routing.set` | routing table |

Notifications (engine → UI): `run.event { runId, event: AgentEvent }`, `state.changed { ProjectState }`, `spec.changed { file }`, `question.asked { Question }`, `form.requested { formId, title, templateId?, fields, prefill? }`, `permission.requested { ... }`, `toast { level, text }`.

All payload types are zod schemas in `packages/protocol`, shared by engine and UI.

## 5. Project layout (what AWP writes into the user's repo)

```
<project>/
├─ CLAUDE.md                # generated; points to specs + AWP rules (AGENTS.md added with Codex after v1)
├─ MEMORY.md                # durable facts, decisions, gotchas (agent-maintained)
├─ BUGS.md                  # bug log
├─ docs/
│  ├─ PRD.md
│  ├─ DESIGN.md
│  ├─ design/ tokens.json, refs/ (uploads), previews/
│  ├─ ARCHITECTURE.md
│  ├─ PHASES.md
│  ├─ TOOLING.md            # approved skills, MCPs, libraries, tools
│  └─ SECURITY_REPORT.md
├─ .awp/
│  ├─ state.json            # stages, phases, gates, decisions (committed)
│  ├─ routing.json          # per-project routing overrides (committed)
│  ├─ prompts/              # prompt overrides (committed)
│  ├─ checklists/phase-N.json
│  └─ runs/                 # raw agent transcripts (gitignored)
├─ .mcp.json                # Claude Code MCP config (no secrets)
├─ .claude/skills/, .claude/agents/
└─ ...project code
```

`state.json` (abridged):

```json
{
  "schemaVersion": 1,
  "project": { "name": "acme", "mode": "greenfield" },
  "agents": { "available": ["claude"] },
  "stages": {
    "setup": { "status": "complete" },
    "ideation": { "status": "complete", "readiness": 92, "criticRounds": 2, "override": null },
    "design": { "status": "stale" },
    "planning": { "status": "active" }
  },
  "execution": { "mode": "phased" },
  "phases": [
    { "n": 1, "title": "Scaffold + auth", "status": "passed", "commit": "a1b2c3d", "tag": "awp/phase-1" }
  ],
  "usage": { "byStage": {}, "byPhase": {} }
}
```

App-level files (OS app-data folder): `settings.json` (display mode, default routing, model tiers), `projects.json` (recent projects), `tools/` (security binaries), `registry-cache.json`.

## 6. Phase runner

For phase N:

1. **Prepare:** ensure clean git tree (else ask to commit or stash); checkout `awp/build`; load phase N from `PHASES.md`; build context = specs + MEMORY.md + open bugs for this phase.
2. **Execute:** router picks the model tier for `implementation` (or `ui_implementation` when the phase is UI-tagged); both default to balanced (Sonnet). Executor prompt + phase tasks + allowed tools (edit within repo, bash for package manager/build/test commands, approved MCPs). Unattended until done or `maxTurns`.
3. **Verify:** engine runs the project's verify commands from `ARCHITECTURE.md` (install, typecheck, lint, test, build). Failures feed back to the agent for up to 3 fix attempts.
4. **Review:** a separate Claude Code session with fresh context (no shared session ID, `code_review` tier) runs a `reviewer` pass on the phase diff. Blocking review comments go back to step 2 once. After v1, with Codex connected, the agent that did not build does the review.
5. **Commit:** `awp(phase-N): <title>` + tag `awp/phase-N`; agent calls `remember` for decisions worth keeping.
6. **Test handoff:** generate checklist from acceptance criteria → `.awp/checklists/phase-N.json` → UI shows run instructions + checklist; status `awaiting_test`.
7. **Fix loop:** failed items → `log_bug` → `fixer` run → commit `awp(phase-N): fix BUG-xxx` → re-test failed items only.
8. **Gate:** all pass or bugs deferred with reason → `passed` → next phase.

**One-shot mode** runs steps 1–5 for every phase in sequence, setting each to `built`. Then steps 6–8 run once over a combined checklist (`.awp/checklists/oneshot.json`, items grouped by phase). Fix runs check out `awp/build` HEAD and commit `awp(phase-N): fix BUG-xxx` against the phase the failing item belongs to. The runner halts and waits for the user when:
- a phase still fails verify after 3 fix attempts,
- the reviewer still blocks after one rework,
- the agent calls `ask_user`, or
- the user presses Stop or switches to Phased (applied after the current phase).

After a halt the user can fix, roll back to the last good tag, or resume.

Stop at any point sends SIGINT to the CLI process, waits 5 s, then kills the process tree; the phase returns to `pending` with partial work left uncommitted for the user to inspect.

## 7. Routing

- v1: every task runs on Claude Code. `routing.json` maps task types to a `modelTier`; the user can override globally (settings) or per project (`.awp/routing.json`).
- Model tiers `fast | balanced | frontier` map to concrete models in settings (Claude Code accepts aliases such as `haiku`, `sonnet`, `opus`).
- Claude subagents: AWP generates `.claude/agents/*.md` so in-run subagents follow the same tier map: `awp-researcher` (fast: web, docs, lookups), `awp-implementer` and `awp-reviewer` (balanced), `awp-architect` (frontier). Generated CLAUDE.md tells the main agent to delegate to them. This mirrors how AWP itself is built (see this repo's CLAUDE.md, "Model routing").
- After v1: the table gains an `agent` column, with an availability rule (one agent connected → everything uses it) and a cross-review rule (the reviewer is the agent that did not build).

Initial default table (tunable; to be validated with evals before launch):

Default tier → model: `fast` = `haiku`, `balanced` = `sonnet`, `frontier` = `opus`. Principle: code, tests and review on balanced; architecture and deep thinking on frontier; lookups and reading on fast.

| Task type | Tier |
|---|---|
| interview, spec_synthesis, critique | frontier |
| design_theme | frontier |
| architecture, stack_options, phase_planning | frontier |
| implementation, ui_implementation, test_writing, bug_fix | balanced |
| code_review, security_review | balanced |
| research, explore, doc_lookup, registry_lookup, discovery | fast |
| test_checklist, docs | fast |

Every routing decision is logged in the run transcript and shown as a model badge in the UI.

## 8. Security model

- Agents run with `cwd` = project root; allowed tools restrict edits to the repo; out-of-policy actions require user approval.
- Secrets: keychain → env vars of the spawned process only; `.mcp.json` uses `${VAR}` references; gitleaks runs before every phase commit (pre-commit check) to block leaked secrets.
- Registry items are pinned by SHA and shown before install; user-added items are flagged "unverified".
- The engine never opens network ports; MCP uses stdio.
- No telemetry. Crash logs stay local unless the user exports them.

## 9. Testing AWP itself

| Layer | Tooling |
|---|---|
| Engine units (router, state machine, parsers, registry) | Vitest |
| Adapter parsing | Golden-file tests over recorded `claude` stream-json |
| Engine integration (full stage flows) | Vitest + FakeAdapter + temp git repos |
| UI components | Vitest + Testing Library |
| Rust | `cargo test` (supervisor, keychain wrapper) |
| End-to-end smoke | Manual checklist per release on Windows + macOS; tauri-driver E2E on Windows later |
| Contract tests vs real CLI | Opt-in CI job with real `claude` (manual trigger; costs tokens) |

## 10. Build and release

- Monorepo with Bun workspaces:
```
awp/
├─ apps/desktop/          # Tauri app (src/ React, src-tauri/ Rust)
├─ packages/engine/       # engine sidecar + AWP MCP server
├─ packages/protocol/     # zod schemas + types shared by UI and engine
├─ packages/prompts/      # prompt templates + section schemas
├─ registry/              # registry.json + AWP-native skills
├─ assets/3d/             # rifle.glb, target.glb, sources (.blend)
├─ PRD.md, DESIGN.md, ARCHITECTURE.md, IMPLEMENTATION.md   # these spec files (repo root)
└─ MEMORY.md, BUGS.md
```
Note: `docs/` inside a *user's* project (§5) is where AWP writes that project's specs. AWP's own specs live at this repo's root.
- Engine binaries built per target triple (`awp-engine-x86_64-pc-windows-msvc.exe`, `awp-engine-aarch64-apple-darwin`, `awp-engine-x86_64-apple-darwin`) and referenced in `tauri.conf.json` `bundle.externalBin`.
- GitHub Actions: lint + test on PR; release workflow with `tauri-action` builds MSI/NSIS (Windows) and DMG (macOS), signs/notarizes when secrets are present, uploads to GitHub Releases, publishes updater manifest.

## 11. Risks and constraints

| Risk | Mitigation |
|---|---|
| CLI flags/event formats change | Adapter version probe, tested ranges, golden-file tests, FakeAdapter |
| Provider terms for tools that wrap Claude Code | AWP is a wrapper: it starts the user's own installed CLI under their own login and never handles credentials. Re-read Anthropic's terms before the public release and document supported auth modes |
| Unsigned v1 builds (code signing deferred) | Windows SmartScreen and macOS Gatekeeper will warn on install; the install docs explain how to proceed. The updater's own signing key (free, separate from OS code signing) is still required |
| Long-running runs vs app quit | Engine persists state per step; on quit mid-run, ask to stop or keep running until done |
| Windows process handling (signals, paths) | Job objects / tree-kill for stop; normalize paths; CI on Windows |
| Bun-compiled binary size (~60–90 MB per target) | Acceptable for v1; revisit with Node SEA if needed |

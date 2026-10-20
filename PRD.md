# AWP — Product Requirements Document

**One-liner:** AWP is a desktop app that structures and streamlines vibecoding with a spec-first approach, so the coding agent can "one-shot" a project instead of guessing.

**Status:** Draft v0.2 · Open source (MIT) · Windows + macOS · Owner: Bobwaft

**v1 scope decisions (2026-10-15):** desktop app first, shipped as a single v1.0 with all ten stages and the 3D rifle; Claude Code is the only agent in v1 (Codex after v1); the primary user is a solo builder starting a new project; importing an existing repo (brownfield) comes after v1.

---

## 1. Problem

Vibecoding with Claude Code or Codex works best when the agent gets a complete, unambiguous spec. In practice:

- Users start coding with a vague idea, so the agent fills gaps with guesses that must be undone later.
- Good practice (PRD → design → architecture → phased build → test → security review) lives in people's heads, not in the tool.
- Useful skills, MCP servers, and libraries are scattered across GitHub repos and blog posts; users don't know which to install for a given project.
- Long sessions lose context; nobody keeps MEMORY.md or BUGS.md up to date by hand.

## 2. Solution

AWP is a **template for vibecoding**: a guided, stage-by-stage desktop app that wraps the user's own Claude Code install (Codex support after v1). Under the hood it uses pre-loaded prompts and a curated skill registry to turn the user's vision into rigid specs, then runs a phased build with commits, user testing, and a security pass.

**AWP is a wrapper around Claude Code, not a replacement for it.** Every run is the user's own installed `claude` CLI, started on their machine under their own login, with AWP supplying the prompts, the tools (via its MCP server) and the UI around it. AWP never calls model APIs, never sees or stores Claude credentials, and users bring their own subscription. The built-in terminal (§6.7) also lets the user run Claude Code interactively inside AWP whenever they want.

## 3. Target users

| Persona | Need | What AWP gives them | Release |
|---|---|---|---|
| **Solo builder / indie dev, new project (primary)** | Ship a full app fast without a team | Guided specs, phased build, security pass | v1 |
| Designer who codes a little | Build what they designed | Design-first flow, Figma/inspiration intake, taste skills | v1 (served by the Design stage, not optimised for) |
| Experienced dev with an existing repo | Add features without breaking things | Brownfield mode: as-is specs from the repo, delta specs | After v1 |
| Hackathon team (2–4 people) | Go from idea to demo in hours | Fast ideation-to-plan, parallel phases | After v1 (needs multi-user story) |

Every v1 trade-off favours the primary persona.

**Non-users (v1):** teams of any size, enterprise teams needing SSO, shared cloud workspaces, or audit logs.

## 4. Principles

1. **No guessing.** A stage cannot complete while its spec has blocking open questions.
2. **Specs are files.** Every artifact is Markdown in the user's repo, versioned by git, readable without AWP.
3. **Bring your own agent.** Runs the user's own Claude Code install and subscription. v1 supports Claude Code only; an adapter layer keeps Codex (and others) addable later.
4. **The user picks how much to supervise.** *Phased* mode: the agent runs one phase unattended, then stops for the user to test. *One-shot* mode: the agent runs every phase back to back and the user tests once at the end. Automated checks (build, lint, tests, review) gate every phase in both modes.
5. **Simplest valid method.** Prefer an existing tool or skill over custom code.

## 5. User flow

AWP runs ten stages in order. In Phased mode, stages 6 and 7 loop per phase; in One-shot mode, stage 6 runs all phases and then stage 7 runs once. Users can go back to any earlier stage; downstream specs are flagged as stale.

| # | Stage | User does | AWP does | Output file(s) |
|---|---|---|---|---|
| 1 | Setup | Connects accounts/tools, using the built-in terminal for installs and logins | Detects CLIs, checks logins, pre-types fix commands, stores tokens in OS keychain | App settings |
| 2 | Ideation | Describes the vision, features, specs | Interviews, synthesizes, flags ambiguity | `docs/PRD.md` |
| 3 | Design | Gives styles, colors, fonts; uploads sketches/inspiration | Runs design skills, proposes 2–3 themes, generates tokens | `docs/DESIGN.md`, `docs/design/` |
| 4 | Planning | Chooses stack/architecture with AWP | Proposes stacks with trade-offs; splits work into phases | `docs/ARCHITECTURE.md`, `docs/PHASES.md` |
| 5 | Connectors | Approves/rejects suggestions; connects accounts | Suggests MCPs, skills, libraries, tools; installs approved ones | `docs/TOOLING.md`, `.mcp.json`, skills dirs |
| 6 | Implementation | Watches or walks away | Builds one phase, verifies build/tests, commits, updates memory | Code, git commits, `MEMORY.md` |
| 7 | Testing | Tests features from a checklist; reports expected/unexpected | Generates checklist, logs bugs, fixes, re-tests | `BUGS.md` |
| 8 | Security | Reviews findings, accepts fixes | Secrets, dependency, static, license, AI review; drafts legal docs | `docs/SECURITY_REPORT.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md` |
| 9 | Polishing | Requests final revisions | Applies revisions as mini-phases | Commits |
| 10 | Shipping | Confirms release | Tags release, writes README/CHANGELOG, optional GitHub push/release | Release tag |

### 5.1 Setup
- Detect `claude`, `git` and `gh` on PATH, their versions, and whether Claude Code is logged in.
- Each missing or logged-out item has a **"Fix in terminal"** button. It opens AWP's built-in terminal (§6.7) and types the install or login command (e.g. the Claude Code installer, `claude` then `/login`, `gh auth login`) without pressing Enter, so the user reviews it and runs it. Setup re-checks automatically when that terminal command exits.
- Connect GitHub (via `gh auth login` in the terminal, or a token stored in the keychain), Figma, and other accounts on demand.
- Setup cannot complete without Claude Code (signed in) and git. Optional tools (gh, Semgrep) never block and are offered again when a stage needs them.
- Every fix also has a "Do it manually" path, so the terminal is never required. Cards poll while a fix is in progress (interactive logins don't exit), and on Windows detection re-reads PATH so fresh installs are found without a restart. Signed-in cards show which account and plan will be used. Full flow: DESIGN.md §3.5.

### 5.2 Ideation
- Chat interview on the left, live `PRD.md` on the right (editable). AWP asks for: problem, users, core features, user stories, data, integrations, platforms, non-goals, success criteria.
- A **critic pass** lists open questions as blocking or non-blocking.
- A **readiness score** (0–100) shows how complete each required section is. It is informational only and never blocks. It updates after every change to the spec, without an extra AI call: a section the critic scored and that hasn't changed since keeps the critic's score; any other required section scores 0 if empty, 100 if filled. The total is the average over required sections.
- *After v1, brownfield:* the user selects a local repo or GitHub URL, AWP writes an as-is summary, then interviews for new features ("Existing" and "New" PRD sections).

### 5.2.1 Spec gate rule (Ideation, Design, Planning)
- **Complete stage** is enabled when there are zero blocking questions, and the stage completes only when the user clicks it.
- The critic runs at most **3 rounds** per stage visit. If blocking questions remain after round 3, AWP lists them and the user either answers them or completes anyway with a reason, which is logged in `.awp/state.json`.
- Non-blocking questions never block. They carry into the spec's "Open questions" section.

### 5.3 Design
- Inputs: style words, colors, fonts, references (URLs, images), sketches, schematics, Figma file links.
- AWP runs design skills (e.g. taste-skill) to propose 2–3 named themes, each with palette, type scale, spacing, motion, and component examples rendered as a live preview.
- User picks or mixes a theme; AWP writes `DESIGN.md` with design tokens (also exported as `docs/design/tokens.json`).
- Uploaded files are copied to `docs/design/refs/` and referenced from `DESIGN.md`.

### 5.4 Planning
- AWP proposes 2–3 stacks with trade-offs (fit to PRD, complexity, hosting, cost). User picks or edits.
- AWP writes `ARCHITECTURE.md` (components, data model, APIs, folder layout, conventions).
- AWP splits the build into phases in `PHASES.md`. Each phase has: goal, tasks, files touched, acceptance criteria, and a user test checklist. Phases should be shippable increments, sized to fit one agent session.

### 5.5 Connectors / Tools / MCPs
- **Project-tailored discovery runs first.** When the last spec stage (Planning) completes, AWP runs Anthropic's `claude-code-setup` plugin (its `claude-automation-recommender` skill), or a similar recommender, against the finished specs and project scaffold. It returns connectors, MCP servers, skills, plugins, hooks and subagents tailored to this specific project. This step is what opens the Connectors stage.
- AWP merges the recommender's output with matches from its curated registry ([REGISTRY.md](REGISTRY.md)). Items found in the registry show as verified. Items only the recommender found show as "unverified" and must pass the same source and license review before install.
- Overlapping items are grouped (REGISTRY.md groups), and AWP suggests at most one item per group unless the user asks for more.
- Suggestions cover MCP servers (e.g. Figma, Blender), skills (e.g. GSAP), plugins, libraries (e.g. Lenis, Anime.js), and external tools (e.g. Framer).
- Each suggestion shows why it fits, what it costs (tokens, accounts, money), its source and license, and whether it sends telemetry.
- **License policy:** anything that ends up inside the user's product must let the user ship and sell that product freely (no copyleft binding the app, no source-available terms). Narrow field-of-use limits are allowed with a guard that skips the item when the PRD falls in that field. Tools that only act on the code may use any license that lets the user run them, and they are never bundled. See REGISTRY.md.
- Approved items are installed per project (skills into `.claude/skills/`; MCPs into `.mcp.json`). Items needing accounts prompt the user to connect.
- Token-saving skills (e.g. ponytail, graphify, caveman) are offered by default.

### 5.6 Implementation
- **Execution mode** is chosen when Implementation starts (Phased is preselected) and can be changed between phases:
  - **Phased:** after each phase AWP hands off to Testing and waits for the gate before the next phase.
  - **One-shot:** AWP runs all phases back to back with no human stops. Each phase still verifies, gets reviewed, commits and tags, so rollback works the same. AWP stops early only if a phase fails verification after its retries, or if the agent calls `ask_user` on a blocking question. When the last phase finishes, Testing runs once with a combined checklist.
  - Switching One-shot → Phased mid-run takes effect after the current phase. The Stop button works in both modes.
- AWP works through `PHASES.md` in order. For each phase: plan → build → self-verify (install, build, lint, unit tests) → review → commit → write `MEMORY.md` → (Phased) hand off to Testing.
- Commit format: `awp(phase-N): <phase title>`; each phase is also tagged `awp/phase-N` for rollback.
- Live view shows the agent's steps, files changed, tokens/cost used, and a Stop button.

### 5.7 Testing (runs alongside Implementation)
- After each phase (Phased) or after the last phase (One-shot), AWP generates a checklist from the acceptance criteria and tells the user how to run the app. One-shot checklists are grouped by phase so each failure maps to the phase that caused it.
- For each item the user marks Pass / Fail and adds notes (expected vs actual, optional screenshot).
- Failures become entries in `BUGS.md` (ID, phase, steps, expected, actual, severity, status). AWP runs a fix loop, then re-tests failed items only.
- The phase gate opens when all items pass or remaining bugs are explicitly deferred.

### 5.8 Security
Runs after the last phase, and can be re-run any time:
- Secret scanning (gitleaks).
- Dependency vulnerabilities (osv-scanner or the ecosystem's audit).
- Static analysis (Semgrep) plus an AI review focused on auth, injection, data exposure, and unsafe defaults.
- License compliance: dependency and asset licenses, generated `LICENSE` and `THIRD_PARTY_NOTICES.md`.
- Legal/privacy drafts: if the PRD says the app collects user data, AWP drafts a privacy policy and terms, clearly labeled "not legal advice — review before publishing".
- Output: `docs/SECURITY_REPORT.md` with findings by severity; user approves fixes, which run as a security phase.

### 5.9 Polishing
- AWP hands the project back with a summary of what was built, and asks for final revisions.
- Each revision runs as a small phase with its own commit and quick test.

### 5.10 Shipping
- AWP writes/updates README and CHANGELOG, tags `v1.0.0` (or user-chosen version), and optionally pushes and creates a GitHub release.
- Ship screen shows the final "hit" animation and a project summary (phases, commits, tokens used, bugs fixed).

## 6. Features

### 6.1 Pre-loaded prompts
- A versioned library of prompt templates per stage: **interviewer** (asks questions), **synthesizer** (writes the spec), **critic** (finds ambiguity and contradictions), **executor** (implements a phase), **verifier** (checks acceptance criteria).
- Prompts use structured output (JSON schemas) where AWP needs to parse results.
- Users can view and override prompts per project (`.awp/prompts/`); overrides never edit the built-in library.

### 6.2 Pre-loaded skills
- A curated **skill registry**: a manifest of skills with source repo, pinned version (commit SHA), license, supported agents, stage tags, and a short description.
- Categories: token efficiency (ponytail, graphify, caveman), design (GSAP, Lenis, taste-skill), and AWP's own stage skills (e.g. `awp-interview`, `awp-phase-runner`, `awp-test-checklist`, `awp-security-review`).
- Users can add their own skills by repo URL or local folder.
- The full list will be supplied by the owner; registry entries must be verified (source, license) before inclusion.

### 6.3 Live spec panel
- Every spec stage shows the conversation and the Markdown file side by side. AI edits appear live and as reviewable diffs; user edits are respected and fed back to the agent.

### 6.3.1 Chat plus structured input
The conversation column offers two ways to answer, and the agent picks the one that fits each request:
- **Chat** for open-ended talk: the vision, clarifications, "what if" questions.
- **Structured forms** when AWP needs a specification in a known shape. Forms used in v1:
  - **Feature spec** (Ideation): name, user story, acceptance criteria (repeatable list), priority (Must/Should/Could), data touched, edge cases, out of scope.
  - **Design schema** (Design): palette (color pickers per role), fonts (picker with pairing preview), type scale, spacing density, corner radius, motion level, references (uploads/URLs).
  - **Stack constraints** (Planning): language/framework preferences, hosting, database, auth, budget, must-use and must-avoid libraries.
  - **Bug report** (Testing): steps, expected, actual, severity, screenshot.
- The agent can also send an ad-hoc form (any small set of fields) when a question has a clear shape, such as "pick one of these three flows" or "fill in these four limits".
- The agent uses a form only when the answer has a known shape (3+ fields) and prefills it from earlier answers, marked as AI-filled. Every required field offers "Not sure, help me", which becomes a suggestion or an open question for the critic instead of a forced answer. "Ask about this form" lets the user ask a question without losing the draft. A declined template isn't offered again that visit. Full flow: DESIGN.md §3.5.
- Forms validate before submit, keep a draft if the user switches away or the run stops, and can be dismissed with "Answer in chat instead". Submitted answers appear in the chat history as a compact summary card. The agent receives them as structured data, and the synthesizer writes them into the spec.
- Required form fields map to the spec's required sections, so a completed form raises readiness directly.

### 6.4 Model routing
- **v1:** every task runs on Claude Code. A routing table maps each task type to a model tier (`fast | balanced | frontier`). Defaults: Haiku for lookups, search and doc reading; Sonnet for writing code and tests and for code review; Opus for specs, architecture and other deep thinking. Defaults ship with AWP and the user can edit them. The same tiers apply to generated subagents.
- Routing decisions are logged so users can see which model did what.
- *After v1:* with Codex connected, the table also picks the agent per task type, and the agent that did not build reviews the phase.

### 6.5 Project dashboard
- List of projects with current stage, phase progress, last activity, and open bugs.
- Re-open any project and continue where it stopped (state lives in the repo).

### 6.6 Usage tracking
- Per stage and per phase: tokens, cost estimate (where the agent reports it), duration.

### 6.7 Built-in terminal
- AWP hosts a real terminal (full PTY: colors, interactive programs, resize). It opens in a bottom drawer from any screen (`` Ctrl+` ``) and as an inline panel in Setup.
- The default shell is the user's own: PowerShell on Windows, the login shell on macOS. It starts in the project folder, or the home folder before a project exists. Multiple tabs are allowed.
- Uses: installing and logging in to tools during Setup (§5.1), running the app being built during Testing, and running `claude` interactively inside AWP ("Open Claude Code here").
- AWP may pre-type commands from its own built-in list (Fix-in-terminal, "run the app" hints) into a new tab, and never presses Enter for the user. Exception: when the user clicks Approve on a Connectors item whose install command is owner-verified (from the registry, shown on the card first), AWP types it AND presses Enter in a new, named tab. Nothing else is ever run for the user. **Agents cannot write to the terminal**, so a prompt-injected agent can't stage commands. Terminal sessions the user types into are not recorded in `.awp/runs/`, which holds agent runs only.

## 7. Functional requirements (summary)

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Detect and verify the Claude Code install and login (plus git, gh) | Must |
| FR-2 | Create a new project folder with git | Must |
| FR-3 | Chat interview + live editable spec for Ideation, Design, Planning | Must |
| FR-4 | Critic pass with blocking/non-blocking open questions; gate per §5.2.1 | Must |
| FR-5 | Design theme proposals with live preview and token export | Must |
| FR-6 | Phase plan with acceptance criteria and test checklists | Must |
| FR-7 | Skill/MCP registry, suggestions, approval, per-project install | Must |
| FR-8 | Phase runner: build, verify, commit, tag, MEMORY.md update; Phased and One-shot execution modes | Must |
| FR-9 | Test checklist UI, BUGS.md, fix loop, phase gate | Must |
| FR-10 | Security scans, license check, legal drafts, report | Must |
| FR-11 | Polish revisions and ship (README, CHANGELOG, tag, GitHub release) | Must |
| FR-12 | Model-tier routing table with user overrides | Must |
| FR-13 | 3D rifle navigator with 2D fallback | Must |
| FR-14 | Prompt override per project | Should |
| FR-15 | Usage tracking per stage/phase | Should |
| FR-16 | Rollback to any phase tag | Should |
| FR-19 | Built-in terminal (PTY, tabs, Fix-in-terminal in Setup) | Must |
| FR-20 | Structured input forms alongside chat (feature spec, design schema, stack constraints, bug report, ad-hoc) | Must |
| FR-21 | Light and dark themes, plus follow-system | Must |
| FR-17 | Import an existing repo (brownfield) | After v1 |
| FR-18 | Codex adapter, agent routing, cross-agent review | After v1 |

## 8. Non-functional requirements

- **Platforms:** Windows 10/11 (x64) and macOS 13+ (Apple Silicon and Intel). Development and manual testing happen on native Windows; macOS is covered by CI plus a manual pass before release. Linux later.
- **Performance:** cold start under 3 s on a mid-range laptop; 3D scene at 60 fps on integrated GPUs, else auto-fallback to 2D.
- **Privacy:** no telemetry by default; nothing leaves the machine except through the user's own agents and connected services.
- **Security:** tokens in the OS keychain only; agents confined to the project folder; every shell command the agent runs is logged.
- **Reliability:** state saved after every step; a crash or quit resumes at the last completed step.
- **Accessibility:** full keyboard navigation, reduced-motion mode, WCAG AA contrast in 2D panels in both light and dark themes.
- **License:** MIT.

## 9. Success metrics

- Time from idea to first passing phase: under 60 minutes for a small web app.
- Share of phases that pass user testing on the first try: 70%+ (tracked separately for Phased and One-shot runs).
- Blocking questions found in Ideation vs bugs caused by spec gaps found later (track ratio).
- GitHub stars/forks and community-contributed registry entries after launch.

## 10. Out of scope (v1)

- Calling model APIs directly or providing model access.
- Codex or any agent other than Claude Code (adapter layer keeps this open).
- Importing existing repos (brownfield mode).
- Parallel phases / multiple agents in git worktrees.
- Cloud sync, team accounts, real-time multi-user collaboration.
- Mobile app.
- Hosting/deploying the user's project (AWP can suggest a deploy tool in Connectors).

## 11. Risks

| Risk | Mitigation |
|---|---|
| Agent CLIs/SDKs change their interfaces | Adapter layer per agent; pin tested versions; contract tests |
| Rifle imagery raises IP issues | Original 3D model only (no game assets), built in Blender via Blender MCP with procedural geometry and CC0 textures |
| Third-party skills carry malicious instructions | Curated registry with pinned SHAs and review; show skill contents before install |
| Token cost of long interviews and phases | Token-saving skills on by default; usage shown live; routing to cheaper models for light tasks |
| 3D scene hurts performance | GPU detection, 2D mode, lazy-loaded scene |
| Provider terms for tools that wrap Claude Code | AWP is a wrapper: it runs the user's own installed CLI under the user's own login and never handles credentials (owner decision). Re-read Anthropic's terms once before the public release |
| One-shot runs compound early mistakes across later phases | Automated verify + review gate every phase; stop on repeated verify failure; per-phase tags allow rollback to the last good phase |
| Single v1.0 release means no user feedback until everything is built | Dogfood: build real side projects with AWP from Phase 11 onward and log findings in BUGS.md |

## 12. Open questions

- [x] License: **MIT**.
- [ ] Registry seed list: drafted in REGISTRY.md (12 overlap groups); the owner verifies it with the checklist there (needed by Phase 9).
- [x] Name: **AWP is kept, no fallback.** AWP is free and not sold (owner decision).
- [x] One-shot vs phased: **the user chooses** (§5.6).
- [x] Parallel phases: **not in v1**.
- [x] Agent routing: **Claude Code only in v1**. Model-tier defaults in ARCHITECTURE.md §7.
- [x] Provider terms: AWP is a **wrapper** around the user's own Claude Code, not a driver of it (owner decision). Not a blocker; re-read the terms before public release.
- [x] Light theme: **in v1** (DESIGN.md §4).
- [x] Code signing: **deferred**. v1 may ship unsigned; see ARCHITECTURE.md §10.

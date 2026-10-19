# AWP — Registry seed list

**Status:** v0.2 (2026-10-19). Researched by Claude; **owner-verified 2026-10-19** for the entries marked approved below (serena and claude-mem not approved). G10 additions owner-approved 2026-10-19. Every entry needs its source, license and pinned SHA checked before it goes into `registry/registry.json` (Phase 9).
**Source of data:** each repo's README and LICENSE, plus authenticated `gh api` on 2026-10-15. Short SHAs appear in the group tables; full SHAs, stars and push dates are in [Pinned metadata](#pinned-metadata).

How this list is used (PRD §5.5):
1. When Planning completes, AWP runs `claude-code-setup` against the specs and scaffold to find project-specific items.
2. Its output is merged with matches from this registry. Registry items show as verified; recommender-only items show as unverified.
3. AWP suggests **at most one item per "pick one" group** and any number from "complementary" groups, unless the user asks for more.

## License policy (owner decision, 2026-10-15)
AWP is free and open source (MIT). What matters is whether an item's license **reaches into the software the user builds**:
- **Code that ends up in the user's product** (libraries, copy-paste components, generated scaffolds): the license must let the user ship and sell their product freely. Exclude copyleft that would bind the user's app (GPL/AGPL linked into the product), source-available terms, and restrictions on selling the product. Restrictions that only stop redistributing the library *itself* (e.g. react-bits) are acceptable. Narrow field-of-use restrictions (e.g. GSAP) are acceptable with a guard: AWP skips the item when the PRD falls inside the restricted field and shows the restriction on the card.
- **Tools that only act on the code** (skills, plugins, MCP servers, CLIs): allowed under any license that lets the user run them, including GPL, CC-BY(-SA) and source-available. They are installed by the user's own CLI and never bundled into AWP or into the user's product.
- Third-party telemetry is acceptable; the suggestion card shows it as a flag.

## Kinds

| Kind | What it is | How AWP installs it |
|---|---|---|
| `skill` | Markdown instructions (+ scripts) Claude loads on demand | Copy at pinned SHA into `.claude/skills/<id>/` |
| `plugin` | Claude Code plugin: bundles skills, commands, hooks, agents and/or MCP servers | `/plugin marketplace add` + `/plugin install`, recorded in `.claude/settings.json` `enabledPlugins` |
| `mcp` | MCP server the user runs locally | Entry in `.mcp.json` (secrets as `${VAR}`) |
| `connector` | Hosted remote MCP / integration that needs an account | Entry in `.mcp.json` pointing to the remote URL + account connection in Setup |
| `library` | Package the project's code depends on | Recorded in `docs/TOOLING.md`; the executor installs it in the relevant phase |
| `tool` | External CLI or app | Recorded in `docs/TOOLING.md` with install instructions |

## Groups

### G1 · Codebase understanding — *pick one*
Overlap: all three give the agent a map of the code so it reads less.

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `graphify` | skill + CLI | Local tree-sitter knowledge graph of code; query/path/explain | `uv tool install graphifyy` then `graphify install --project` | Apache-2.0 | 10130e79 (branch `v8`) | Python 3.10+, uv. Code graph needs no LLM; docs/media pass uses the model | **Default** |
| `understand-anything` | plugin | Multi-agent knowledge graph + browser dashboard | `/plugin marketplace add Egonex-AI/Understand-Anything` | MIT | f2d0164f | First `/understand` is token-heavy on large repos; Node ≥ 18 for the dashboard | Alt: user wants a visual dashboard |
| `serena` | mcp | Semantic retrieval and **editing** via language servers (40+ languages) | `uv tool install -p 3.13 serena-agent`, `serena init`; README says don't use the marketplace | GPL-3.0-or-later (app); MIT (SolidLSP) | d9e4c796 | GPL: suggest only as a user-installed tool, **never bundle**. Windows not mentioned in README; open Windows issues #1022, #1182 | **Not approved by owner (2026-10-19)** |

### G2 · Library docs lookup — *pick one*

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `context7` | mcp | Version-specific library/API docs on demand | `.mcp.json` entry (also in claude-plugins-official external plugins) | MIT | 1658cc42 | Works without a key; a free key raises rate limits, sent as header `Authorization: Bearer <key>` (no documented env var for a committed `.mcp.json`) | **Default** for any stack with third-party libraries |

### G3 · Token saving and output style — *complementary* (with care)
Overlap: both cut tokens, but in different places. ponytail cuts **code** (smallest change); caveman cuts **prose** (terse replies, trimmed tool output).

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `ponytail` | plugin | "Lazy senior dev": smallest change that solves the task; review/audit/debt commands | `/plugin marketplace add DietrichGebert/ponytail`, `/plugin install ponytail@ponytail` | MIT | 84740e3d | Savings figures self-reported | **Default** for build phases |
| `caveman` | tool + skill | Terse agent replies; trims logs/JSON/test output | `npx @caveman-ai/cli@latest` | Apache-2.0 | d262ab38 | Node 22.13+. "Auto" mode needs an account; optional "Caveman Cloud" proxy. **AWP must not enable it for interview or spec stages**: terse output hurts user-facing questions | Optional, build phases only, cloud features off |

### G4 · Session memory — *optional*
Overlap with AWP: AWP already keeps `MEMORY.md` via its `remember` tool.

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `claude-mem` | plugin (hooks + worker + MCP search) | Captures and compresses tool-use observations, injects them into later sessions | `/plugin marketplace add thedotmack/claude-mem`, `/plugin install claude-mem` | Apache-2.0 | b8fc2ef9 | Installer nudges toward a hosted observer account (trial, then paid). AWP installs with `CLAUDE_MEM_ONLINE_OPTIN=false` / local provider only | **Not approved by owner (2026-10-19)** |

### G5 · Design direction and taste — *pick one*
Overlap: all four steer the agent away from generic AI-looking UI. They power AWP's Design stage themer and UI phases.

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `impeccable` | skill + CLI (also a plugin) | 24 `/impeccable` commands, 59 detector rules; design, critique, polish, harden | `npx impeccable install` (Claude Code), `/impeccable init` | Apache-2.0 | 5bf0a069 | Telemetry on by default (accepted; shown on the card; opt-out `npx impeccable telemetry off`). Calls impeccable.style API at design start; installs a UI-edit hook into `.claude/settings.local.json`; downloads an engine binary | **Default** (AWP itself uses it) |
| `taste-skill` | skill / plugin | Art direction + browser self-check for distinctive sites | `/plugin marketplace add Leonxlnx/taste-skill`, `/plugin install taste-skill@taste-skill` | MIT | f624f37a | Node 22+, Chromium browser. Network for image search (Wikimedia, Openverse, Met) | Alt: marketing / landing sites |
| `ui-ux-pro-max` | skill / plugin + CLI | Generates design systems (styles, palettes, type, patterns) for web and mobile | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`, `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` | MIT | 56ea9cf1 | Python 3 (stdlib). Known symlink error before v2.5.1 | Alt: mobile apps, or users wanting many style options |
| `frontend-design` | plugin (Anthropic official) | Distinctive frontend UI generation | claude-plugins-official | Apache-2.0 (plugin LICENSE confirmed 2026-10-19) | ea10b213 | — | Alt: lightest-weight option |

### G6 · UI components — *optional*

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `react-bits` | library (copy-paste components) | 215+ animated React components and backgrounds | `npx shadcn@latest add @react-bits/<Component>` | MIT + Commons Clause ([LICENSE.md](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)): use in any app incl. commercial is granted; selling or redistributing the components themselves is not | 963f4d21 | Passes the policy. Pro tier is paid. Some files carry third-party notices (Apache-2.0, MIT) to keep | React projects wanting animated UI |

### G7 · Animation and motion — *complementary*
GSAP and Lenis are designed to work together (Lenis syncs with ScrollTrigger).

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `gsap-skills` | skill / plugin | Correct GSAP usage: timelines, ScrollTrigger, plugins, perf | `/plugin marketplace add greensock/gsap-skills` | MIT (skills text) | aed9cfd3 | GSAP itself uses the [Standard No Charge license](https://gsap.com/community/standard-license/): free incl. commercial ("any website, web application, or digital interface"). **Prohibited:** use "in tools that allow users to build visual animations without code" that compete with Webflow. Guard: don't suggest when the PRD is a no-code/visual animation builder. The card also shows the non-binding summary's note ("as long as end users are not charged a fee") with a link, since that fee condition isn't in the binding text. GSAP's FAQ says AI-generated code is not a prohibited use | When the PRD/design calls for animation |
| `lenis` | library | Smooth scroll over native scroll | `npm i lenis` | MIT | e01eefb1 | No agent skill exists; the gsap skill covers usage | With `gsap-skills` on scroll-driven sites |
| `animejs` | library | Lightweight JS animation | `npm i animejs` (v4.5.0) | MIT (package.json; no root LICENSE file) | — | No agent skill | Alt to GSAP; **use instead of GSAP** when the GSAP guard trips |

### G8 · Browser testing and UI verification — *pick one*
Lets the agent check its own UI work before the human Testing stage.

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `playwright-mcp` | mcp | Browser automation via accessibility snapshots | `.mcp.json` entry | Apache-2.0 | b8b4183e | — | **Default** for web apps (E2E flows) |
| `chrome-devtools-mcp` | mcp | Console, network, perf traces, DOM inspection | `.mcp.json` entry | Apache-2.0 | 6606011a | Needs Chrome | Alt: performance-sensitive or debugging-heavy UIs |

### G9 · Security — *complementary*
AWP's Security stage already runs gitleaks, osv-scanner and Semgrep directly (ARCHITECTURE.md §3.3). These add agent-side checks during the build.

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `security-guidance` | plugin (Anthropic official) | Hook-based security checks on Claude's edits | claude-plugins-official | Apache-2.0 | ea10b213 | — | **Default** |
| `trailofbits-skills` | plugin marketplace | Code audit, static analysis, Semgrep rule authoring, supply-chain risk | `/plugin marketplace add trailofbits/skills` | CC-BY-SA-4.0 | 5c99c03f | Share-alike: link and install, **don't bundle or modify** | Optional; projects handling auth, payments or user data |
| ~~`semgrep-mcp`~~ | mcp | Semgrep scans from the agent | — | MIT | cade7825 | Last push 2025-10 (stale); AWP already runs the Semgrep CLI | Not suggested |

### G10 · Service connectors — *complementary, suggested only when the PRD/stack uses the service*

| ID | Kind | Purpose | Install | License | SHA | Flags | Default |
|---|---|---|---|---|---|---|---|
| `figma` | connector (remote MCP) | Design context, Code Connect, canvas write | `.mcp.json` → `mcp.figma.com/mcp` | hosted; [Figma Developer Terms](https://www.figma.com/legal/developer-terms/) (guide repo unlicensed) | — | Only clients in Figma's MCP Catalog may connect. Here the client is the **user's Claude Code**, not AWP, which only writes the `.mcp.json` entry. Rate limits by seat: View/Collab ~20 calls/month (README says 6), Professional Full/Dev 200/day, Enterprise 600/day; Starter plan effectively unusable. Canvas write needs a Full seat and will become usage-paid. The card shows the user's likely limits | When Figma links are given in Design |
| `github-mcp` | mcp | Repos, issues, PRs, Actions | `.mcp.json` entry | MIT | e3809fe9 | GitHub PAT or OAuth. AWP itself uses `gh` for git ops; this is for the agent | When the project uses GitHub issues/Actions |
| `supabase` | connector / mcp | Projects, DB, migrations, edge functions | `.mcp.json` → `mcp.supabase.com/mcp` | Apache-2.0 | f46b3d29 | Supabase OAuth or token | When the stack picks Supabase |
| `blender-mcp` | mcp + Blender add-on | Agent drives Blender scenes and 3D assets | per README (repo now `ahujasid/mcp-for-blender`) | MIT | 7a0373ec | Local Blender 3.0+, uv. **Also a candidate for building AWP's own rifle model** (Phase 14) | When the PRD needs 3D assets |
| `stripe` | connector | Payments: customers, products, invoices, refunds | `.mcp.json` → `mcp.stripe.com` (OAuth) | MIT (stripe/ai) | a8813a70 | Write tools incl. refunds/payouts; some writes need human approval. Full-access and restricted keys stop working Dec 2026 (use OAuth or agent keys) | When the PRD takes payments |
| `vercel` | connector | Deployments, projects, logs | `.mcp.json` → `mcp.vercel.com` (OAuth) | hosted, Vercel terms | — | Can deploy and make purchases; card asks for confirmation on writes | When the stack deploys to Vercel |
| `cloudflare` | connector | Workers, DNS, R2, account resources | `.mcp.json` → `mcp.cloudflare.com/mcp` (OAuth or API token as Bearer) | Apache-2.0 | 45384abd | Can change account resources; some features need a paid Workers plan; exact Claude Code line unverified | When the stack uses Cloudflare |
| `aws` | mcp | AWS API via CLI commands | `uvx awslabs.aws-api-mcp-server@latest` | Apache-2.0 (awslabs/mcp, labs tier) | 788d9642 | Runs arbitrary AWS CLI: AWP sets `READ_OPERATIONS_ONLY=true` and suggests a ReadOnly IAM role by default | When the stack uses AWS |
| `firebase` | mcp | Firebase projects, Firestore, Auth, deploy | Plugin `firebase@firebase`, or `npx -y firebase-tools@latest mcp` | MIT (firebase-tools) | 1d5f1417 | Deploy and data-write tools | When the stack uses Firebase |
| `sentry` | connector | Errors, issues, releases | `.mcp.json` → `mcp.sentry.dev/mcp/<org>/<project>` (OAuth) | hosted; local package is FSL-1.1 (source-available) so **hosted only** | 44a8c1cf (getsentry/toolkit) | Experimental tools off | When the project uses Sentry |
| `linear` | connector | Issues and projects | `.mcp.json` → `mcp.linear.app/mcp/readonly` by default (OAuth) | hosted, Linear terms | — | Read-only endpoint by default; write endpoint on request | When the team tracks work in Linear |
| `atlassian` | connector | Jira and Confluence | `.mcp.json` → `mcp.atlassian.com/v2/mcp` (OAuth or API token) | Apache-2.0 | b74220d4 | Likely Cloud-only (unverified); v1 endpoint moves to v2 on 2027-03-01 | When the team uses Jira/Confluence |
| `slack` | plugin / connector | Read and post in Slack | `/plugin install slack@claude-plugins-official` (hosted `mcp.slack.com`, OAuth) | MIT (plugin) | — | Needs workspace admin approval | When the PRD/team uses Slack |
| `gitlab` | connector | Repos, MRs, issues, pipelines | `.mcp.json` → `<host>/api/v4/mcp` (OAuth `mcp` scope or fine-grained PAT) | hosted, GitLab terms | — | Docs warn about prompt injection; rate limits; admin must allow it | When the project is on GitLab |
| `notion` | connector | Pages and databases | `.mcp.json` → `mcp.notion.com/mcp` (OAuth) | hosted, Notion terms | — | Hosted URL from a third-party guide: verify before writing `registry.json`. Local server is unmaintained, not used | When the team uses Notion |
| `neon` | connector | Serverless Postgres: projects, branches, SQL | `.mcp.json` → `mcp.neon.tech/mcp?readonly=true` (OAuth or API key) | MIT | 1f341ee8 | Can delete projects/branches; **read-only by default**; docs say dev/test use | When the stack picks Neon |
| `mongodb` | mcp | MongoDB / Atlas | `npx -y mongodb-mcp-server@latest --readOnly --telemetry disabled` | Apache-2.0 | 0cfe62ab | Connection string via `MDB_MCP_CONNECTION_STRING`; **read-only and telemetry off by default** | When the stack picks MongoDB |
| `planetscale` | connector | MySQL/Postgres on PlanetScale | `.mcp.json` → `mcp.pscale.dev/mcp/planetscale` (OAuth) | hosted, PlanetScale terms | — | Read-only via OAuth scopes by default; blocks unbounded UPDATE/DELETE; prompts for DDL | When the stack picks PlanetScale |
| `upstash` | connector | Redis, QStash, Vector | `.mcp.json` → `mcp.upstash.com/mcp` (OAuth or API key) | MIT | f85a67bc | Read-only keys supported and preferred | When the stack picks Upstash |
| `prisma` | connector | Prisma Postgres management | `.mcp.json` → `mcp.prisma.io/mcp` (OAuth) | hosted, Prisma terms | — | Can delete databases and restore backups; CLI guardrails don't apply; **no read-only mode**, card warns | When the stack uses Prisma Postgres |
| `turso` | mcp | Local libSQL/SQLite database | `tursodb <file>.db --mcp` | MIT (tursodatabase/turso) | a504787e | Write and schema-change tools; read-only flag unverified | When the stack picks Turso/SQLite |
| `convex` | mcp | Convex deployments, data, functions | `npx -y convex@latest mcp start` | Apache-2.0 (convex-js) | 322c3951 | Production off by default; never pass `--dangerously-enable-production-deployments` | When the stack picks Convex |

### G11 · Meta and setup — *used by AWP, not suggested to users by default*

| ID | Kind | Purpose | Install | License | SHA | Flags | Role in AWP |
|---|---|---|---|---|---|---|---|
| `claude-code-setup` | plugin (Anthropic official) | `claude-automation-recommender`: scans manifests, frameworks, `.claude/`, CLAUDE.md; recommends top 1–2 MCPs, skills, hooks, subagents and plugins per category | claude-plugins-official | Apache-2.0 (plugin LICENSE confirmed 2026-10-19) | ea10b213 | Output is Markdown with fixed headings (`## Claude Code Automation Recommendations`, `### <category>`) and per-item **Why**/**Install** lines. **Read-only**: prints install commands as text, never installs. Its SKILL.md says "use web search" but it lists no web tool, so AWP's headless run must allow WebSearch. Non-interactive use is unverified | **Engine of the discovery step** after Planning (PRD §5.5) |
| `skill-creator` | plugin (Anthropic official) | Create, edit, eval and tune skills | claude-plugins-official | Apache-2.0 (repo) | ea10b213 | — | Used to build AWP's native `awp-*` skills; offered to users who add their own skills |
| `task-observer` (one-skill-to-rule-them-all) | skill | Watches sessions, flags corrections and skill gaps, proposes skill updates | `npx skills add rebelytics/one-skill-to-rule-them-all --skill task-observer` | CC-BY-4.0 (README/API; no LICENSE file on main) | 56e89071 | Attribution required. Needs an activation line in CLAUDE.md or a session-start hook | Optional; could feed AWP's MEMORY.md / prompt improvements |
| `anthropic-skills` | skill bundle (Anthropic official) | frontend-design, webapp-testing, mcp-builder, claude-api, docx/pdf/pptx/xlsx | `/plugin marketplace add anthropics/skills` | Apache-2.0 for most; **docx/pdf/pptx/xlsx are source-available, not open** | dbd4588f | Suggest individual skills, not the bundle | Pick per need (e.g. `webapp-testing` overlaps G8) |

### G12 · Workflow methodology — *reference only; never suggested into AWP projects (owner decision)*
Overlap with AWP itself: each runs its own spec → plan → task → build loop. Installing one inside an AWP project would fight AWP's orchestrator and gates. Use them as **prompt and process references** for AWP's own prompt library (MIT ones can be adapted with attribution).

| ID | Kind | What it overlaps in AWP | License | SHA | Notes |
|---|---|---|---|---|---|
| `spec-kit` | tool (installs `/speckit-*` skills) | Ideation/Planning (constitution, specify, plan, tasks, implement) | MIT | f6e72bc8 | Python 3.11+, uv. Good reference for spec section schemas |
| `superpowers` | plugin | Brainstorm, plans, subagent execution, TDD, review, worktrees | MIT | bb92a774 | Small telemetry (logo fetch), opt-out env var. Strong reference for executor/verifier prompts |
| `agent-skills` (addyosmani) | skill pack (25 skills) | Spec, planning, incremental build, TDD, review, security, shipping | MIT | aeac41d4 | Already used to build AWP (`.claude/skills/`). Reference for stage prompts |
| `feature-dev` | plugin (Anthropic official) | Guided feature workflow | Apache-2.0 | ea10b213 | Reference; also relevant to brownfield mode after v1 |
| `code-review`, `pr-review-toolkit` | plugins (Anthropic official) | AWP's phase review step | Apache-2.0 | ea10b213 | Reference for `impl.reviewer`; could become optional reviewers after v1 |
| `task-master` | mcp + CLI | Planning (PRD → tasks) and phase tracking | **MIT + Commons Clause** | c0c98d36 | Needs a provider API key unless Claude Code is the provider. Last push 2026-04. Reference only |

## Excluded

| ID | Why |
|---|---|
| `omniroute` | (Owner confirmed.) Self-hosted AI gateway that routes your own provider API keys to many models. Conflicts with PRD principles 3 and §10: AWP never calls model APIs or handles model credentials. Its routing overlaps AWP's own model-tier router. MIT, so it can be revisited if AWP ever supports API-key mode |
| `semgrep-mcp` | **Archived** by Semgrep (last push 2025-10-28); AWP runs the Semgrep CLI directly |

## Defaults when a new project reaches Connectors
Pre-checked unless the recommender or the PRD says otherwise: `graphify`, `context7`, `ponytail`, `impeccable`, `security-guidance`, `playwright-mcp` (web apps).
Everything else is suggested only on a signal from the specs or `claude-code-setup`.

## Owner verification checklist
- [x] License texts read: claude-plugins-official plugins (all Apache-2.0), react-bits (passes), one-skill (CC-BY-4.0, credit Eoghan Henn / rebelytics), Trail of Bits (CC-BY-SA-4.0), anthropics/skills docx/pdf/pptx/xlsx ("all rights reserved", no derivatives or redistribution; output files not restricted; tool-only, never bundle).
- [x] Figma: connector only, governed by Figma Developer Terms; acceptable because the MCP client is the user's Claude Code.
- [x] Claude Code is listed in Figma's MCP Catalog (owner confirmed).
- [x] `task-master` reference only (tool, never in the user's product). Third-party telemetry accepted.
- [x] GSAP: AWP itself may ship it. AWP is not a visual animation builder, and bundling falls under "reproduce". Conditions: keep GSAP's notices, ship its license text in `THIRD_PARTY_NOTICES.md`, and never present GSAP as MIT. The guard on user projects stays.
- [x] Star counts, licenses, push dates and full SHAs fetched with authenticated `gh` (see Pinned metadata). The high star counts are real.
- [x] `animejs` pinned.
- [x] Headless `claude-code-setup` run approved by the owner; the Phase 9 TODO verifies it returns parseable output.
- [x] Owner verification 2026-10-19: approved G1 graphify, understand-anything; G2 context7; G3 ponytail, caveman; G5 all four; G6 react-bits; G7 all three; G8 both; G9 security-guidance, trailofbits-skills; G10 figma, github-mcp, supabase, blender-mcp; G11 all four. Not approved: serena, claude-mem. G12 and Excluded stay out of `registry.json`.
- [x] G10 additions researched 2026-10-19 (vendor-official, maintained, clear license) and owner-approved: stripe, vercel, cloudflare, aws, firebase, sentry, linear, atlassian, slack, gitlab, notion, neon, mongodb, planetscale, upstash, prisma, turso, convex. Not approved: netlify (no LICENSE in repo). Write-capable connectors default to read-only where the service supports it.
- [ ] Re-fetch SHAs right before writing `registry.json` if more than a few weeks have passed.

## Pinned metadata
Fetched 2026-10-15 with authenticated `gh api`. Use these SHAs for `registry.json`. Repo names use the canonical casing GitHub returns.

| Repo | Stars | SPDX (GitHub) | Last push | Full HEAD SHA |
|---|---|---|---|---|
| thedotmack/claude-mem | 101k | Apache-2.0 | 2026-10-16 | b8fc2ef9bab0dd1438d6cc8699c6884445ad409b |
| Leonxlnx/taste-skill | 97k | MIT | 2026-10-14 | f624f37a8c650b9cc550253104925efe4c8de246 |
| pbakaus/impeccable | 82k | Apache-2.0 | 2026-10-16 | 5bf0a069dc857e1b5f4b090e004d9d5b231416ca |
| rebelytics/one-skill-to-rule-them-all | 3.4k | CC-BY-4.0 | 2026-10-09 | 56e890712273ce231b478adc56ee2eb81101c3d6 |
| greensock/gsap-skills | 16k | MIT | 2026-07-29 | aed9cfd3277740755f6bfc1155c7aa645403b760 |
| darkroomengineering/lenis | 17k | MIT | 2026-10-15 | e01eefb1f55cd08bc051521d74f5f8182b71ee9d |
| DavidHDev/react-bits | 49k | NOASSERTION (LICENSE.md: MIT + Commons Clause) | 2026-10-15 | 963f4d21dca65326a470956c42b7b467804f3c14 |
| nextlevelbuilder/ui-ux-pro-max-skill | 136k | MIT | 2026-10-15 | 56ea9cf174ed86786187daa9de0e6247cb0747e4 |
| github/spec-kit | 141k | MIT | 2026-10-15 | f6e72bc8523de8ec8368129cbdea78d45f27cef8 |
| eyaltoledano/claude-task-master | 28k | NOASSERTION (MIT + Commons Clause) | 2026-04-28 | c0c98d367c55296bfe69e65680625b6db437af02 |
| oraios/serena | 30k | NOASSERTION (GPL-3.0+ / MIT split) | 2026-10-15 | d9e4c796fae0207ba6848d1df4b331122a5567b5 |
| Egonex-AI/Understand-Anything | 87k | MIT | 2026-10-12 | f2d0164f72fe678805c34245a6df36acededfebd |
| JuliusBrussee/caveman | 113k | Apache-2.0 | 2026-10-15 | d262ab3882952a59312ff3537cd86d894523c5ab |
| DietrichGebert/ponytail | 165k | MIT | 2026-10-15 | 84740e3d344b69b4a133201fa519eb37a62a2b2a |
| addyosmani/agent-skills | 107k | MIT | 2026-10-13 | aeac41d4d005999432bb7312f7ff06383a91d59d |
| Graphify-Labs/graphify (default branch `v8`) | 127k | Apache-2.0 | 2026-10-14 | 10130e79ed9caf8f60d998073e097531eaa1a395 |
| obra/superpowers | 300k | MIT | 2026-10-10 | bb92a77741419a4ab5f06e711a283343f1ada0c3 |
| upstash/context7 | 63k | MIT | 2026-10-15 | 1658cc4213e2700d29acff9bc11cdefbdd1eeaa1 |
| microsoft/playwright-mcp | 38k | Apache-2.0 | 2026-10-08 | b8b4183e099f136cbec0388a6088d4aa2f6b9685 |
| ChromeDevTools/chrome-devtools-mcp | 54k | Apache-2.0 | 2026-10-15 | 6606011ab3cdbc018904554dceae6ad6c5477fde |
| trailofbits/skills | 7.6k | CC-BY-SA-4.0 | 2026-10-15 | 5c99c03fb8a9ea568432ecbcba5d86e9f4ac2bf0 |
| semgrep/mcp (archived) | 0.7k | MIT | 2025-10-28 | cade782501e611373844696edc2ceef31eb7e1f7 |
| figma/mcp-server-guide | 2.1k | none | 2026-10-15 | f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5 |
| ahujasid/mcp-for-blender | 31k | MIT | 2026-10-06 | 7a0373ec9199183cb460068c4f96aed9c579fb4f |
| github/github-mcp-server | 34k | MIT | 2026-10-15 | e3809fe91c7546633241006bf0b91f23b2595e28 |
| anthropics/skills | 181k | none (per-skill: Apache-2.0 or "all rights reserved") | 2026-10-09 | dbd4588f9e1033efb41dad4bef2f7947c8993d44 |
| supabase/mcp | 3.0k | Apache-2.0 | 2026-10-15 | f46b3d2996d93baad25cce1b94b46440dcc44ecb |
| juliangarnier/anime | 74k | MIT | 2026-08-21 | 01b81be1df6843ccfe0a71c0699a746bf740dd77 |
| anthropics/claude-plugins-official (repo) | 39k | Apache-2.0 | 2026-10-16 | ea10b213686c90bb1984b2016937310e05336cf3 |

Plugins inside `anthropics/claude-plugins-official` (last commit touching each folder; pin to the repo SHA above, track these for change detection):

| Plugin path | Last commit SHA | Date |
|---|---|---|
| plugins/claude-code-setup | fc49e6815f5562bbfd692e65ab6a9b4d7edb0a5f | 2026-05-28 |
| plugins/skill-creator | 2a40fd2e7c52207aa903bd33fc4c65716126966e | 2026-04-23 |
| plugins/security-guidance | 87bc24ab561c4876dff68bfaec4881dbc83f8250 | 2026-10-15 |
| plugins/frontend-design | 44490cccaf6d9f82fdeec9416fbf7c9bd72575dc | 2026-09-01 |
| plugins/code-review | aecd4c852f10b466245f18383fa6aad8c0b10d57 | 2026-02-20 |
| plugins/pr-review-toolkit | ce721c1f1d5da2c281588818e072ae01a05d2e73 | 2026-04-28 |
| plugins/feature-dev | aecd4c852f10b466245f18383fa6aad8c0b10d57 | 2026-02-20 |

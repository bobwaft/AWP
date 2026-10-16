# AWP — agent instructions

## Plan
- The plan lives in IMPLEMENTATION.md: phases as headings, TODOs as `- [ ]` checkboxes. When planning or revising, edit that file in this format. Don't create a separate plan file.

## Specs
- Source of truth, in priority order when they conflict: ARCHITECTURE.md, DESIGN.md, PRD.md, IMPLEMENTATION.md (all at the repo root). REGISTRY.md holds the curated skill/plugin/MCP seed list. Read the parts relevant to the current phase.

## Model routing
Match the model to the job. The main session can't change its own model, so delegate to the pinned project agents in `.claude/agents/`:

| Job | Model | How |
|---|---|---|
| Writing code, writing tests, bug fixes | Sonnet | Main session on Sonnet (`/model sonnet`) during phases, or the `implementer` agent |
| Code review | Sonnet | `code-reviewer` agent (fresh context) |
| Architecture decisions, spec work, trade-offs, phase planning, deep debugging | Opus | Main session on Opus during spec work, or the `architect` agent |
| Lookups: web search, reading docs/repos online, license/version checks, "where is X" | Haiku | `researcher` agent |

- Never do web research or doc reading inline in an Opus or Sonnet session when the `researcher` agent can do it; split broad research into parallel `researcher` calls, one focused question each.
- Never use Haiku for code, tests, review or decisions.
- If the main session is on the wrong model for the work ahead (e.g. Opus about to write code), say so in one line and suggest `/model <name>` or delegate.

## Working rules
- Work on exactly one phase at a time, in order. Never start the next phase without the human saying so.
- Do not guess. If a spec is ambiguous or missing something you need, stop and ask; record the answer in MEMORY.md.
- Prefer the simplest valid method and existing libraries over custom code.
- Do not change the specs unless the human approves; propose changes as a short diff in chat.
- Keep secrets out of the repo. Never commit .env files.
- Never use or download Valve/CS game assets. 3D assets must be original.

## Definition of done (every phase)
- `bun run check` passes (typecheck + lint + unit tests for all workspaces); `cargo test` passes when Rust changed.
- The app starts with `bun run dev` without console errors.
- New behavior has tests (FakeAdapter for anything agent-related; never spend real tokens in tests).
- MEMORY.md updated with decisions, gotchas, and commands worth remembering.
- One commit: `awp(phase-N): <phase title>`, then tag `awp/phase-N`.
- Print the phase's "You test" checklist and stop.

## Bugs
- Log each reported failure in BUGS.md: ID (BUG-001…), phase, steps, expected, actual, severity, status.
- Fix, commit `awp(phase-N): fix BUG-xxx`, and ask the human to re-test only the failed items.

## Design tools
- UX flows, IA, wireframes and UX copy: Intent, during spec work.
- Visual design, UI polish and hardening of built UI: Impeccable.
- Don't run both on the same task.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

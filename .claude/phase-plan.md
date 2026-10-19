Phase: 9 — Registry + Connectors
Start commit: 4fd06e629e738f8b7ecb8730f7cc0a96405b113d
Owner verification: done 2026-10-19 (REGISTRY.md v0.2: approved list; not approved: serena, claude-mem, netlify).
TODOs (in order):
1. registry.json schema (zod in protocol) + seed entries built from REGISTRY.md approved items, pinned SHAs — files: packages/protocol, registry/registry.json, registry/ tests — depends: none
2. Fetch + cache (app-data registry-cache.json) + bundled fallback; install by pinned SHA with tree-hash check and file preview; writers for .claude/skills/ and .mcp.json (${VAR}) and plugin settings — files: packages/engine/src/registry/* — depends: 1
3. Discovery: headless claude-code-setup recommender run, parse to registry-shaped items — depends: 1
4. Merge recommender + registry matches; verified vs unverified; one per overlap group — depends: 1,3
5. submit_suggestions tool + connectors.suggester prompt; SuggestionCard approve/reject; account prompts for token items; Connectors stage view (stage 5) — depends: 2,4
6. docs/TOOLING.md generation; AWP-native skills (awp-interview, awp-phase-runner, awp-test-checklist, awp-security-review) in registry/skills/ — depends: 2
7. User-added items by repo URL or local folder, flagged unverified — depends: 2
Parallel-safe groups: none (shared engine/protocol files)
Open questions: none (architect consulted for install safety + module design)

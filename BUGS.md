# BUGS

## BUG-001
- Phase: 0
- Steps: push to GitHub; CI job `check (windows-latest)` runs `bun run check`.
- Expected: check passes on Windows and macOS.
- Actual: `biome check` fails on Windows, reporting every file as unformatted because of CRLF (`␍`) line endings. Typecheck passed.
- Severity: high (CI red on Windows)
- Status: fixed (added `.gitattributes` forcing LF); awaiting CI re-run

## BUG-002
- Phase: 5
- Steps: run `bun run check`, then `git status`.
- Expected: the working tree stays clean.
- Actual: engine tests fell back to `./data` (no `AWP_DATA_DIR`) and rewrote the tracked `data/projects.json` with temp project paths; it was committed with `/tmp/awp-*` entries in phases 5-8.
- Severity: low
- Status: fixed (vitest setup sets `AWP_DATA_DIR` to a temp dir; `data/` untracked and gitignored); awaiting re-test

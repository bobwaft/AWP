# BUGS

## BUG-001
- Phase: 0
- Steps: push to GitHub; CI job `check (windows-latest)` runs `bun run check`.
- Expected: check passes on Windows and macOS.
- Actual: `biome check` fails on Windows, reporting every file as unformatted because of CRLF (`␍`) line endings. Typecheck passed.
- Severity: high (CI red on Windows)
- Status: fixed (added `.gitattributes` forcing LF); awaiting CI re-run

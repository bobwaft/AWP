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

## BUG-003
- Phase: 2
- Steps: run `bun run dev`, open Settings → About (also: open Setup, open the dashboard).
- Expected: shows the engine version from a real round-trip.
- Actual: reads "engine version unavailable". Setup stays on "Checking…" forever and the dashboard shows "No projects yet".
- Root cause: `engine_request` (Rust) serializes a missing `params` as `"params": null`; every param-less method schema is `undefined | {}`, so the engine answers INVALID_PARAMS for `ping`, `version`, `project.list`, `setup.detect`, `setup.freshEnv`, `design.refs`, `plan.phases`. Unit tests never cross the Rust bridge, so nothing caught it. The UI swallows the errors (`catch {}`), so nothing is shown.
- Severity: critical (blocks the whole app)
- Status: closed (re-tested 2026-10-17: pass)

## BUG-004
- Phase: 2
- Steps: kill the engine process in Task Manager.
- Expected: the supervisor restarts the engine, a toast tells the user, and the app recovers.
- Actual: restart and toast work (verified). But in dev the engine runs as `bun.exe`, not `awp-engine` (so the "You test" step names a process that does not exist in dev), and after a restart the UI never re-fetches (Setup/projects stay stale until reload).
- Severity: medium
- Status: closed (re-tested 2026-10-17: pass)

## BUG-005
- Phase: 3
- Steps: dev "Run prompt" screen, run "list the files in this folder" with Claude Code.
- Expected: events stream in promptly.
- Actual: ~12 s and ~$0.15 per run. Folder defaults to `.`, which is the engine cwd `apps/desktop/src-tauri` (3.3 GB `target/`), and no model is passed, so the CLI default (Opus) is used.
- Severity: medium
- Status: closed (re-tested 2026-10-17: pass)

## BUG-006
- Phase: 3
- Steps: dev "Run prompt" screen, click Run, then Stop within ~1 s.
- Expected: the run ends within 5 s.
- Actual: Stop is silently ignored and the run completes (~12 s). `useRun.stop()` returns early while `runId` is still null (before `agent.run` resolves). Stop after the first event works (~0.5 s).
- Severity: high
- Status: closed (re-tested 2026-10-17: pass)

## BUG-007
- Phase: 5
- Steps: app-data `projects.json` holds `{ "projects": [...] }` (left by an older build); open the dashboard or create a project.
- Expected: recents load; project is created and opened.
- Actual: toast "Internal error"; `recents()` returns a non-array → `.map`/`.filter` TypeError in `project.list`/`create`/`open`. Create scaffolds the folder, then fails, leaving a half-created project the UI never opens.
- Severity: critical
- Status: fixed (verified in the live app); awaiting re-test

## BUG-008
- Phase: 1
- Steps: open any screen with the terminal drawer collapsed.
- Expected: no page-level scrollbar.
- Actual: a full-height window scrollbar is always shown. The collapsed drawer's `h-7` button sits inside a section with `border-t`, overhanging the viewport by <1 px; `html/body` don't clip.
- Severity: medium (visible on every screen)
- Status: closed (re-tested 2026-10-17: pass)

## BUG-009
- Phase: 6
- Steps: open Ideation (any spec panel), Edit tab.
- Expected: editor matches DESIGN.md tokens in dark and light.
- Actual: CodeMirror uses its default light styling: white line-number gutter, grey active-line bar on the dark panel.
- Severity: medium
- Status: closed (re-tested 2026-10-17: pass)

## BUG-010
- Phase: 4
- Steps: window narrower than ~1100 px (e.g. 800 px); open Setup.
- Expected: DESIGN.md §150: minimum window 1100 × 700; layouts fit.
- Actual: no `minWidth/minHeight` in tauri.conf.json; Setup's fixed 28 rem column + terminal pane overflow: token input spills outside its card, "Save token" is off-screen, horizontal scrollbar.
- Severity: medium
- Status: closed (re-tested 2026-10-17: pass)

## BUG-011
- Phase: 1
- Steps: any scrollable area (palette list, chat, page).
- Expected: scrollbars follow the theme.
- Actual: unstyled Windows scrollbars (light grey with arrow buttons) on the dark UI.
- Severity: low
- Status: closed (re-tested 2026-10-17: pass)

## BUG-012
- Phase: 2
- Steps: any engine failure.
- Expected: the user sees what failed; the log records requests.
- Actual: UI catches and drops engine errors in many places (Setup, About, project list, `enter`), and the engine logs only unhandled errors, so failures are silent and hard to diagnose.
- Severity: medium
- Status: fixed (verified in the live app); awaiting re-test

## BUG-013
- Phase: 5
- Steps: type a non-absolute parent folder on the dashboard (e.g. drive-relative `C:Users\x`), create a project.
- Expected: refused; projects are only created at full paths.
- Actual: the path resolved against the engine cwd (`apps/desktop/src-tauri` in dev) and the project was scaffolded inside the repo.
- Severity: medium
- Status: fixed (engine refuses with `PATH_NOT_ABSOLUTE`; Create disabled for non-absolute paths); awaiting re-test

## BUG-014
- Phase: 6
- Steps: Ideation; run until the critic returns several open questions.
- Expected: the open-questions list stays in its area and scrolls; chat, input and Complete stay usable.
- Actual: the list covers other content, so forms and the gate can't be tested. `QuestionList` has no max height or overflow, and the chat column doesn't clip, so a long list spills over the chat, input and the panes below.
- Severity: high (blocks Phase 6 tests)
- Status: closed (re-tested 2026-10-19: pass)

## BUG-015
- Phase: 6
- Steps: Ideation; AWP opens a form with several fields.
- Expected: the form stays inside the input dock; the open-questions list stays visible.
- Actual: the form grows past the chat area and bleeds into the open-questions list. The input dock has no max height or scroll.
- Severity: high (blocks the Phase 6 form tests)
- Status: closed (re-tested 2026-10-19: pass)

## BUG-016
- Phase: 6
- Steps: Ideation with open questions listed.
- Expected: each question's status label sits on one line.
- Actual: "○ optional" / "● blocking" wraps onto two lines, wasting space.
- Severity: low
- Status: closed (re-tested 2026-10-19: pass)

---
name: manual-test
description: Ask the human to run manual tests through AskUserQuestion — a phase's "You test" checklist from IMPLEMENTATION.md, re-tests of fixed bugs from BUGS.md, or any "please check X in the app" step. Use whenever you would otherwise print a test checklist for the human to run, when the user says "let's test", "start testing", "re-test", or after a phase or bug fix is ready for the human. Records results in IMPLEMENTATION.md and BUGS.md.
---

# Manual test

The human runs the checks; you ask about them one by one with `AskUserQuestion`, never as a printed checklist they have to answer in prose.

## 1. Collect the tests

- Phase checks: the unticked `- [ ]` items under the phase's **You test** heading in IMPLEMENTATION.md, in order. Work phase by phase; don't skip ahead past a phase with open failures unless the user says so.
- Re-tests: in BUGS.md, the bugs with status "fixed … awaiting re-test". Re-test only those.
- If a test needs setup (restart `bun run dev`, open a project, a fresh install), say so in one or two lines before the first question.
- If anything under `packages/engine/` or `apps/desktop/src-tauri/` changed since the user last started the app, the setup must say: close the AWP window, stop `bun run dev` and start it again. Vite only hot-reloads the UI; the engine and Rust keep running the old code, so a re-test without a full restart can fail for the wrong reason.

## 2. Ask

- One test per question, at most 4 questions per `AskUserQuestion` call. For longer lists, make more calls in order.
- **Question:** the concrete steps and the expected result, written so it can be done without opening the spec, ending with "?". Example: "Phase 4: Rename `claude` temporarily. Does Setup report it missing, and does Fix in terminal type the install command in a new tab?"
- **Header** (≤12 chars): phase and topic, e.g. `P4 login`, `BUG-014`.
- **Options:** `Pass` (what passing looks like), `Fail` (description: "Describe what happened in Other"), `Skip` ("Not tested now"). If you can run the check yourself (e.g. `bun run check`), add `Run it for me` instead of `Skip`. Single-select, no "(Recommended)".
- If several tests share one setup, put them in the same call.

## 3. Read the answers

- Read every answer literally, including text typed in Other and any notes. "Works, but slow" is a failure to log, not a pass. "Skip, blocked by X" means X is a bug.
- If a failure is too vague to log or reproduce, ask one follow-up `AskUserQuestion` with concrete options (use `preview` for layout or behaviour comparisons) before logging it.
- If the user says to stop or change course, do that instead of continuing.
- If the user asks how to do a test, answer briefly, then go on asking.

## 4. Record

- **Pass:** tick that item in IMPLEMENTATION.md (`- [ ]` → `- [x]`). The human's answer is their tick. For a re-test that passed, set the bug's status to `closed (re-tested <YYYY-MM-DD>: pass)`.
- **Fail:** add a BUGS.md entry in the existing format (next BUG-NNN, phase, steps, expected, actual, severity, status `open`). Don't fix bugs in the middle of the pass, unless one blocks the remaining tests; then follow CLAUDE.md's Bugs flow first.
- **Skip:** leave it unticked and mention it in the summary.

## 5. Summarise

After the last question, in no more than 5 lines: passed, failed (bug ids), skipped, and what's next (fix the bugs, then re-test only the failed items, or move on to the next phase). Then ask before starting fixes or the next phase, as CLAUDE.md requires.

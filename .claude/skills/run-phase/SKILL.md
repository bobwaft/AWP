---
name: run-phase
description: Implement the current phase of IMPLEMENTATION.md end to end — plan, explore, build each TODO test-first, review against the spec, then tick off TODOs and commit. Use when the user says to run, start, or continue a phase.
---

# Run Phase

Implement one phase of `IMPLEMENTATION.md` with the fewest tokens that still give correct, tested code. The main session does the work; subagents only explore (cheap) and review (fresh eyes).

## 0. Identify the phase

- Read `IMPLEMENTATION.md`.
- The current phase is the first one with unchecked TODOs, unless the user named one.
- If the phase's TODOs are vague or contradict each other, stop and ask the user before building. Ask everything in one message.

## 1. Plan (once per phase)

First, check the working tree is clean (`git status`). If it isn't, ask the user whether to commit or stash before starting. Then record the current commit (`git rev-parse HEAD`) as the phase's start commit.

Write a short plan to `.claude/phase-plan.md`. Keep it under one screen:

```
Phase: <name>
Start commit: <sha>
TODOs (in order):
1. <TODO> — files: <paths> — depends on: <none | TODO #>
2. ...
Parallel-safe groups: <TODO #s that touch disjoint files and have no dependencies, or "none">
Open questions: <list, or "none">
```

- If there are open questions, show them to the user and wait.
- Otherwise, state the plan in 2–3 lines and proceed. Don't wait for approval unless the phase includes something hard to reverse, such as a schema migration, deleting files, or a public API change.

## 2. Explore (only when needed)

When a TODO involves code or a library you haven't read yet, spawn the **researcher** subagent (pinned to Haiku in `.claude/agents/`) with a narrow question. Library docs and web lookups go to it too. If that agent is missing, use **Explore** with `model: haiku`.

> "In this repo, where is X defined, what calls it, and what's its signature? Return file paths, line numbers, and a ≤10-line summary. Do not paste whole files."

Rules:
- One focused question per subagent. Don't ask it to "understand the codebase."
- Skip this step for files you've already read this session.
- Don't explore speculatively.

## 3. Implement each TODO (main session, test-first)

For each TODO in plan order:

1. **Test first.** Write or extend tests from the TODO's spec, not from any existing implementation. Cover the main behaviour and at least one edge or failure case.
2. Run the tests and confirm they fail for the right reason.
3. **Implement** the minimum code that makes them pass. Follow the existing style and patterns.
4. **Run the full relevant test suite**, plus lint and typecheck if the project has them. Fix failures before moving on.
5. Tick the TODO in `IMPLEMENTATION.md` (`- [ ]` → `- [x]`).
6. Commit: `phase <n>: <TODO summary>`.

If a TODO turns out larger than planned or blocked, note it in `phase-plan.md`, tell the user in one line, and continue with the TODOs that don't depend on it.

### Parallel TODOs (optional)

Only for TODOs listed as parallel-safe, and only when there are 2 or more of them and each is substantial (more than about 15 minutes of work):

- Spawn one **implementer** subagent (Sonnet) per TODO with `isolation: "worktree"`.
- Give each subagent a self-contained prompt: the TODO text, files it may touch, files it must not touch, test-first instructions from step 3, and "return a ≤15-line summary of what changed and test results."
- Merge the worktrees one at a time, running tests after each merge.

When in doubt, run TODOs sequentially. Sequential is the default.

## 4. Review (once per phase)

After all TODOs are done, spawn one **code-reviewer** subagent (Sonnet) with a fresh context. It must not have seen the work being produced:

> "Read the phase '<name>' section of IMPLEMENTATION.md and the diff since the phase's start commit (`git diff <start commit from .claude/phase-plan.md>`). Report: (1) any TODO requirement not met, (2) bugs or untested edge cases, (3) anything that contradicts the spec. Be specific, cite file:line. Do not fix anything. ≤20 lines."

- Fix real issues in the main session, re-run tests, and commit.
- Ignore style nitpicks unless they break project conventions.

## 5. Close out

Tell the user, in no more than 5 lines:
- which TODOs were completed,
- anything deferred or blocked, and why,
- test status,
- the next phase name.

Delete `.claude/phase-plan.md`, or keep it if there are deferred items.

Then hand the phase's "You test" checklist to the human with the **manual-test** skill (one `AskUserQuestion` per batch of up to 4 checks), not as a printed list.

## Cost rules

- Model routing follows CLAUDE.md: code, tests and review on Sonnet; architecture and deep thinking on Opus; lookups on Haiku.
- This skill can't change the main session's model. If the session isn't on Sonnet, say so in one line at the start and suggest `/model sonnet`. If you stay on Opus, delegate each TODO's code and tests to the **implementer** agent instead of writing them inline.
- For an architecturally hard TODO or a planning question the spec doesn't settle, ask the **architect** agent (Opus) for a recommendation instead of switching the whole session.
- Never pass a cheaper model than Sonnet to the review or worktree subagents.
- Subagents return summaries, never file dumps.
- Never spawn a subagent to do something the main session can do in a few tool calls.
- Don't re-read files you've already read unless they've changed.

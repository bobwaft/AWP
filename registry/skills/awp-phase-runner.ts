// AWP-native skill: how to run one build phase from docs/PHASES.md.
export default {
  'SKILL.md': `---
name: awp-phase-runner
description: Build exactly one phase from docs/PHASES.md the AWP way: test first, run the verify commands, commit once, then stop. Use when asked to run, start or continue a phase.
---

# AWP phase runner

Build one phase, prove it works, and stop. Never start the next phase on your own.

## Before you write code
1. Read the phase in docs/PHASES.md: goal, tasks, files, acceptance criteria and its "You test" checklist.
2. Read the parts of docs/ARCHITECTURE.md and docs/DESIGN.md that the phase touches, and the verify commands (install, typecheck, lint, test, build).
3. If the phase is ambiguous or contradicts the specs, stop and ask. Do not guess.

## Build
- Work through the tasks in order. For each one: write a failing test from the acceptance criteria, make it pass with the smallest change, run the verify commands, then continue.
- Prefer the simplest approach and existing libraries over custom code. Keep to the files the phase names unless you must go beyond them, and say why.
- Never put secrets in the repo. Never commit .env files.

## Definition of done
- Every verify command passes.
- New behaviour has tests.
- The app starts without console errors.
- MEMORY.md has the decisions and gotchas worth remembering.
- One commit: \`awp(phase-N): <phase title>\`.

## Bugs
When the user reports a failure, log it in BUGS.md (id, phase, steps, expected, actual, severity, status), fix it, commit \`awp(phase-N): fix BUG-xxx\`, and ask them to re-test only the failed items.

## Finish
Report what was built, what was skipped and why, and hand over the phase's "You test" checklist. Then stop.
`,
} as Record<string, string>;

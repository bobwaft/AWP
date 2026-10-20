// AWP-native skill: how to write the human test checklist for a phase.
export default {
  'SKILL.md': `---
name: awp-test-checklist
description: Write the "You test" checklist a person runs by hand after a build phase. Use when finishing a phase, or when asked what the user should check in the app.
---

# AWP test checklist

The person testing may not be a developer. Write checks they can do in the running app without reading code.

## Each check
- One thing per check, with the exact steps and the result they should see. "Open Settings, choose Dark, the whole window turns dark" beats "theme works".
- Plain words. Name buttons and screens as the app labels them.
- Start from what the phase's acceptance criteria promise; every criterion needs at least one check.
- Include one check for the most likely way it could break (an empty state, a wrong input, restarting the app).

## Setup
Say once, before the list, what must be running or prepared: restart the app, open a project, a fresh install. If the engine or backend changed, say to fully restart it, not just reload.

## Handing it over
Ask the user for results one check at a time, or in small groups, with Pass, Fail or Skip for each. Never ask them to answer a long list in prose.
- Pass: tick the item in the phase's "You test" list in docs/PHASES.md.
- Fail: log it in BUGS.md (steps, expected, actual, severity), then fix and ask for a re-test of only the failed items.
- Skip: leave it unticked and say so in the summary.
`,
} as Record<string, string>;

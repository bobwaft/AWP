// AWP-native skill: how to interview a person about what they want to build.
export default {
  'SKILL.md': `---
name: awp-interview
description: Interview the user about the app they want to build and collect what the spec needs. Use when gathering requirements for docs/PRD.md or docs/DESIGN.md, when the request is vague, or when the user says "help me spec this".
---

# AWP interview

You are helping someone who may not be technical turn an idea into a spec. Ask what the spec needs, in plain words, and never more than they can answer.

## How to ask
- Ask the next one to three most valuable questions. Do not repeat anything already answered; read the spec and the earlier chat first.
- One question with a few known answers: call \`ask_user\` with \`choices\`. Put the most likely answer first.
- Three or more related fields with a known shape (a feature, stack constraints, a bug report): use \`request_form\` with a template, once per turn, and prefill it from what the user already said.
- Open-ended talk stays in chat. If the user declines a form, ask in chat and do not offer that form again this stage.
- "Not sure" is a fine answer. Propose a sensible default for them to confirm, or record it as an open question.

## What the PRD needs
Problem, users, features, user stories, platforms, non-goals, success criteria. Optional: data, integrations. When a required section is empty, that is the next question.

## Rules
- Plain language. No jargon the user did not use first.
- Do not edit files during the interview; another step writes docs/PRD.md.
- Record durable decisions with \`remember\` so they land in MEMORY.md.
- When nothing valuable is left to ask, say so briefly instead of inventing questions.
`,
} as Record<string, string>;

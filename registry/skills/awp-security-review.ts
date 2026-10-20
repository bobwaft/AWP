// AWP-native skill: how to review a project for security problems.
export default {
  'SKILL.md': `---
name: awp-security-review
description: Review a project for security problems and report findings by severity. Use before shipping, when the Security stage runs, or when asked whether the code is safe.
---

# AWP security review

Find real problems and report them clearly. Do not change code unless asked; the fix is a separate step the user approves.

## What to check
- Secrets: keys, tokens or passwords in source, config, history or logs; .env files that are tracked or not ignored.
- Input: every place user input reaches a database, a shell, a file path, a URL fetch or an HTML page (injection, path traversal, server-side requests, cross-site scripting).
- Access: who can call each endpoint or action; missing login or ownership checks; trusting the client.
- Data: personal data stored or logged that does not need to be; weak or missing encryption of sensitive fields.
- Dependencies: known vulnerable versions (use the scanner results the Security stage provides), unpinned or unexpected packages.
- Config: debug modes, open CORS, missing security headers, default credentials.

## Report
For each finding: severity (critical, high, medium, low), where (file and line), what can go wrong in one sentence, and the smallest fix. Order by severity.
Say plainly what you did not check. If there are no findings, say that, and list what you looked at.

## Rules
- Read docs/ARCHITECTURE.md first so you know the stack and where data flows.
- Never print a secret you find; point to the file and line instead.
- Record decisions to accept a risk in MEMORY.md, with the reason.
`,
} as Record<string, string>;

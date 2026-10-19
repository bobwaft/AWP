## Claude Code Automation Recommendations

This project is early-stage: `package.json`, `docs/PRD.md`, and `docs/ARCHITECTURE.md` exist, but there's no `src/`, no tests, no CI config, no `.claude/` directory, and no git repo. The recommendations below are based on the declared stack and what the docs say you're building. I worked from the skill's signal tables and did not read its reference files or run a web search, so treat the specifics as a starting point.

### Codebase Profile
- **Type**: JavaScript/TypeScript (the architecture doc says TypeScript, but there's no `tsconfig.json` yet)
- **Framework**: React 19 + Vite 6
- **Key Libraries**: `@supabase/supabase-js` (auth + Postgres), `stripe` (payments). Deployed on Vercel.

---

### 🔌 MCP Servers

#### Supabase MCP
**Why**: Auth and the todo data both live in Supabase. A Supabase MCP lets Claude inspect tables, check RLS policies, and run queries while you design the schema, instead of you pasting results back.
**Install**: Add the Supabase MCP server per its docs, pointed at a development project, not production.

#### context7
**Why**: The stack has four fast-moving libraries (React 19, Vite 6, Supabase JS v2, Stripe v17). Live docs lookup reduces API guesses, especially for Stripe checkout and Supabase auth flows.
**Install**: `claude mcp add context7`

---

### 🎯 Skills

#### stripe-checkout-flow
**Why**: The PRD describes an upgrade flow through Stripe checkout. That's a multi-step, side-effectful workflow (creating sessions, handling webhooks, updating plan state in Supabase) that you'll repeat during development and testing.
**Create**: `.claude/skills/stripe-checkout-flow/SKILL.md`
**Invocation**: User-only, since it touches payment flows and you want to trigger it deliberately
```yaml
---
name: stripe-checkout-flow
description: Walk through wiring or testing a Stripe checkout upgrade, including webhook handling and plan sync to Supabase.
disable-model-invocation: true
---
```

---

### ⚡ Hooks

#### Block edits to secret and env files
**Why**: Supabase keys and Stripe secret keys will live in `.env` files. A PreToolUse hook that blocks writes to `.env*` prevents accidental commits or overwrites of credentials. This matters more than formatting at this stage.
**Where**: `.claude/settings.json`

#### Auto-format and type-check on edit (once `src/` and `tsconfig.json` exist)
**Why**: The stack is TypeScript + React, so a PostToolUse hook that runs the type checker (`tsc --noEmit`) on edited `.ts`/`.tsx` files catches Supabase and Stripe type mismatches right away. Add Prettier if you adopt it.
**Where**: `.claude/settings.json`

---

### 🤖 Subagents

#### security-reviewer
**Why**: The project handles user auth, paid plans, and payment webhooks. Those are the highest-risk areas. A reviewer focused on Supabase RLS policies, webhook signature verification, and secrets handling is worth having before launch.
**Where**: `.claude/agents/security-reviewer.md`

---

**Want more?** Ask for additional recommendations for any specific category (e.g., "show me more MCP server options" or "what other hooks would help?").

**Want help implementing any of these?** Just ask and I can help you set up any of the recommendations above.

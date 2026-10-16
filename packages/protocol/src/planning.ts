import { z } from 'zod';

const Cmd = z.string().trim().min(1, 'Required');

export const VerifyCommands = z.object({
  install: Cmd,
  typecheck: Cmd,
  lint: Cmd,
  test: Cmd,
  build: Cmd,
});
export type VerifyCommands = z.infer<typeof VerifyCommands>;
export const VERIFY_KEYS = [
  'install',
  'typecheck',
  'lint',
  'test',
  'build',
] as const;

export const StackOption = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  summary: z.string().min(1),
  /** Short "label: value" lines, e.g. "Language: TypeScript". */
  stack: z.array(z.string().min(1)).min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  /** Why it fits (or not) this product and the user's constraints. */
  fit: z.string().min(1),
  verify: VerifyCommands,
});
export type StackOption = z.infer<typeof StackOption>;
export const StackOptionsInput = z.object({
  options: z.array(StackOption).min(2).max(3),
});

export const Phase = z.object({
  n: z.number().int().positive(),
  title: z.string(),
  goal: z.string(),
  tasks: z.array(z.string()),
  files: z.array(z.string()),
  acceptance: z.array(z.string()),
  checklist: z.array(z.string()),
  /** True when the human tests something visible in the UI. */
  ui: z.boolean(),
});
export type Phase = z.infer<typeof Phase>;
export const PhasePlanInput = z.object({ phases: z.array(Phase).min(1) });

// ---- validation ----

/** Human-readable problems; an empty list means the plan can be executed. */
export function validatePhases(phases: Phase[]): string[] {
  const errs: string[] = [];
  if (phases.length === 0) errs.push('The plan has no phases');
  phases.forEach((p, i) => {
    const at = `Phase ${p.n}`;
    if (p.n !== i + 1)
      errs.push(
        `${at}: phases must be numbered 1, 2, 3... in order (this is position ${i + 1})`,
      );
    if (!p.title.trim()) errs.push(`${at}: needs a title`);
    if (!p.goal.trim()) errs.push(`${at}: needs a goal`);
    if (p.tasks.length === 0) errs.push(`${at}: needs at least one task`);
    if (p.acceptance.length === 0)
      errs.push(`${at}: needs acceptance criteria`);
    if (p.checklist.length === 0) errs.push(`${at}: needs a test checklist`);
  });
  return errs;
}

// ---- PHASES.md ----

export function renderPhasesMd(phases: Phase[]): string {
  const list = (items: string[], box = false) =>
    items.map((t) => `- ${box ? '[ ] ' : ''}${t}`).join('\n');
  const body = phases
    .map(
      (p) => `## Phase ${p.n}: ${p.title}

**Goal:** ${p.goal}
**UI:** ${p.ui ? 'yes' : 'no'}

### Tasks
${list(p.tasks, true)}

### Files
${list(p.files)}

### Acceptance criteria
${list(p.acceptance)}

### Test checklist
${list(p.checklist, true)}
`,
    )
    .join('\n');
  return `# Phases\n\n${body}`;
}

const SECTION: Record<string, 'tasks' | 'files' | 'acceptance' | 'checklist'> =
  {
    tasks: 'tasks',
    files: 'files',
    'acceptance criteria': 'acceptance',
    acceptance: 'acceptance',
    'test checklist': 'checklist',
    checklist: 'checklist',
  };

/** Tolerant parser: hand-edited files (extra blank lines, [x] ticks, different bullets) still parse. */
export function parsePhasesMd(text: string): {
  phases: Phase[];
  errors: string[];
} {
  const phases: Phase[] = [];
  const errors: string[] = [];
  let cur: Phase | null = null;
  let section: keyof typeof empty | null = null;
  const empty = { tasks: 1, files: 1, acceptance: 1, checklist: 1 };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const head = line.match(/^##\s+Phase\s+(\d+)\s*[:.\-–—]?\s*(.*)$/i);
    if (head) {
      cur = {
        n: Number(head[1]),
        title: head[2].trim(),
        goal: '',
        tasks: [],
        files: [],
        acceptance: [],
        checklist: [],
        ui: false,
      };
      phases.push(cur);
      section = null;
      continue;
    }
    if (!cur) continue;
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      section = SECTION[h3[1].toLowerCase()] ?? null;
      continue;
    }
    if (/^##\s+/.test(line)) {
      cur = null;
      section = null;
      continue;
    }
    const goal = line.match(/^\*\*Goal:?\*\*:?\s*(.*)$/i);
    if (goal) {
      cur.goal = goal[1].trim();
      continue;
    }
    const ui = line.match(/^\*\*UI:?\*\*:?\s*(\S+)/i);
    if (ui) {
      cur.ui = /^(yes|true|y)$/i.test(ui[1]);
      continue;
    }
    const item = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (item && section) cur[section].push(item[1].trim());
  }
  if (phases.length === 0) errors.push('No "## Phase N: Title" headings found');
  return { phases, errors: [...errors, ...validatePhases(phases)] };
}

// ---- edits used by the phase barrel (all pure) ----

export const renumber = (phases: Phase[]): Phase[] =>
  phases.map((p, i) => ({ ...p, n: i + 1 }));

export function movePhase(phases: Phase[], from: number, to: number): Phase[] {
  if (from < 0 || from >= phases.length || to < 0 || to >= phases.length)
    return phases;
  const next = [...phases];
  const [p] = next.splice(from, 1);
  next.splice(to, 0, p);
  return renumber(next);
}

/** Splits by tasks; acceptance criteria and checklist are copied to both halves for the user to refine. */
export function splitPhase(phases: Phase[], index: number): Phase[] {
  const p = phases[index];
  if (!p || p.tasks.length < 2) return phases;
  const mid = Math.ceil(p.tasks.length / 2);
  const a: Phase = {
    ...p,
    title: `${p.title} (part 1)`,
    tasks: p.tasks.slice(0, mid),
  };
  const b: Phase = {
    ...p,
    title: `${p.title} (part 2)`,
    tasks: p.tasks.slice(mid),
  };
  return renumber([
    ...phases.slice(0, index),
    a,
    b,
    ...phases.slice(index + 1),
  ]);
}

export function mergePhases(phases: Phase[], index: number): Phase[] {
  const a = phases[index];
  const b = phases[index + 1];
  if (!a || !b) return phases;
  const uniq = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  const merged: Phase = {
    n: a.n,
    title: `${a.title} + ${b.title}`,
    goal: `${a.goal} ${b.goal}`.trim(),
    tasks: [...a.tasks, ...b.tasks],
    files: uniq(a.files, b.files),
    acceptance: [...a.acceptance, ...b.acceptance],
    checklist: [...a.checklist, ...b.checklist],
    ui: a.ui || b.ui,
  };
  return renumber([
    ...phases.slice(0, index),
    merged,
    ...phases.slice(index + 2),
  ]);
}

// ---- ARCHITECTURE.md ----

export function renderArchitectureMd(args: {
  projectName: string;
  option: StackOption;
  verify: VerifyCommands;
  notes?: string;
}): string {
  const { option: o, verify: v } = args;
  return `# Architecture: ${args.projectName}

## Overview

${o.summary}

## Stack

Chosen: **${o.name}**

${o.stack.map((s) => `- ${s}`).join('\n')}

### Why this stack

${o.fit}

- Strengths: ${o.pros.join('; ')}
- Trade-offs: ${o.cons.join('; ')}
${args.notes?.trim() ? `\n### Notes from the owner\n\n${args.notes.trim()}\n` : ''}
## Verify commands

The phase runner runs these after every phase. All five must pass.

| Step | Command |
|---|---|
| Install | \`${v.install}\` |
| Typecheck | \`${v.typecheck}\` |
| Lint | \`${v.lint}\` |
| Test | \`${v.test}\` |
| Build | \`${v.build}\` |

## Structure

Decided phase by phase in [PHASES.md](PHASES.md). Keep modules small and document decisions in MEMORY.md.
`;
}

/** Reads the verify table back out of ARCHITECTURE.md (hand edits win). */
export function parseVerifyCommands(md: string): Partial<VerifyCommands> {
  const out: Partial<VerifyCommands> = {};
  for (const key of VERIFY_KEYS) {
    const label = key[0].toUpperCase() + key.slice(1);
    const m = md.match(
      new RegExp(`^\\|\\s*${label}\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`, 'im'),
    );
    if (m) out[key] = m[1].trim();
  }
  return out;
}

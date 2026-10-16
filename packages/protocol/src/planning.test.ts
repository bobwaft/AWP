import { expect, test } from 'vitest';
import {
  mergePhases,
  movePhase,
  type Phase,
  parsePhasesMd,
  parseVerifyCommands,
  renderArchitectureMd,
  renderPhasesMd,
  splitPhase,
  validatePhases,
} from './planning';

const phase = (n: number, o: Partial<Phase> = {}): Phase => ({
  n,
  title: `Title ${n}`,
  goal: `Goal ${n}.`,
  tasks: [`Task ${n}a`, `Task ${n}b`],
  files: [`src/p${n}.ts`],
  acceptance: [`Works ${n}`],
  checklist: [`Check ${n}`],
  ui: n % 2 === 0,
  ...o,
});
const plan = [phase(1), phase(2), phase(3)];

test('PHASES.md round-trips through the parser', () => {
  const md = renderPhasesMd(plan);
  const { phases, errors } = parsePhasesMd(md);
  expect(errors).toEqual([]);
  expect(phases).toEqual(plan);
  expect(renderPhasesMd(phases)).toBe(md);
});

test('hand-edited files still parse (ticks, bullets, spacing, extra sections)', () => {
  const md = `# Phases

Some intro the user wrote.

## Phase 1 - Scaffold
**Goal:**   Get running
**UI:** YES

### Tasks
* [x] Init repo
+ Add CI


### Acceptance criteria
- App starts

### Test checklist
- [X] Opens a window

### Notes
- ignored

## Phase 2: Next
**Goal:** More
### Tasks
- do it
### Acceptance criteria
- passes
### Test checklist
- looks right
`;
  const { phases, errors } = parsePhasesMd(md);
  expect(errors).toEqual([]);
  expect(phases[0]).toMatchObject({
    n: 1,
    title: 'Scaffold',
    goal: 'Get running',
    ui: true,
    tasks: ['Init repo', 'Add CI'],
    acceptance: ['App starts'],
    checklist: ['Opens a window'],
    files: [],
  });
  expect(phases[1].ui).toBe(false);
});

test('validator rejects phases without acceptance criteria, tasks, goal, checklist, or bad numbering', () => {
  const errs = validatePhases([
    phase(1, { acceptance: [] }),
    phase(3, { tasks: [], goal: ' ', checklist: [] }),
  ]);
  expect(errs).toEqual(
    expect.arrayContaining([
      'Phase 1: needs acceptance criteria',
      'Phase 3: needs at least one task',
      'Phase 3: needs a goal',
      'Phase 3: needs a test checklist',
      expect.stringContaining('numbered 1, 2, 3'),
    ]),
  );
  expect(validatePhases([])).toEqual(['The plan has no phases']);
  const parsed = parsePhasesMd(renderPhasesMd([phase(1, { acceptance: [] })]));
  expect(parsed.errors).toContain('Phase 1: needs acceptance criteria');
  expect(parsePhasesMd('nothing here').errors[0]).toContain('No "## Phase N');
});

test('move, split, merge keep numbering valid', () => {
  const moved = movePhase(plan, 2, 0);
  expect(moved.map((p) => [p.n, p.title])).toEqual([
    [1, 'Title 3'],
    [2, 'Title 1'],
    [3, 'Title 2'],
  ]);
  expect(movePhase(plan, 0, 9)).toBe(plan);
  const split = splitPhase(plan, 1);
  expect(split.map((p) => p.n)).toEqual([1, 2, 3, 4]);
  expect(split[1].tasks).toEqual(['Task 2a']);
  expect(split[2].tasks).toEqual(['Task 2b']);
  expect(validatePhases(split)).toEqual([]);
  expect(splitPhase([phase(1, { tasks: ['only'] })], 0)).toHaveLength(1);
  const merged = mergePhases(plan, 0);
  expect(merged).toHaveLength(2);
  expect(merged[0]).toMatchObject({
    n: 1,
    title: 'Title 1 + Title 2',
    ui: true,
  });
  expect(merged[0].tasks).toHaveLength(4);
  expect(merged[1].n).toBe(2);
  expect(validatePhases(merged)).toEqual([]);
  expect(mergePhases(plan, 2)).toBe(plan);
});

test('ARCHITECTURE.md carries all five verify commands and they can be read back', () => {
  const verify = {
    install: 'bun install',
    typecheck: 'bun run typecheck',
    lint: 'bun run lint',
    test: 'bun run test',
    build: 'bun run build',
  };
  const md = renderArchitectureMd({
    projectName: 'acme',
    option: {
      id: 'o',
      name: 'Bun + React',
      summary: 'S',
      stack: ['Language: TypeScript'],
      pros: ['fast'],
      cons: ['young'],
      fit: 'Fits',
      verify,
    },
    verify,
    notes: 'Prefer SQLite',
  });
  for (const c of Object.values(verify)) expect(md).toContain(`\`${c}\``);
  expect(md).toContain('Prefer SQLite');
  expect(parseVerifyCommands(md)).toEqual(verify);
  expect(
    parseVerifyCommands(md.replace('`bun run test`', '`vitest run`')).test,
  ).toBe('vitest run');
});

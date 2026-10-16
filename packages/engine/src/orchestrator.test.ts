import { expect, test } from 'vitest';
import {
  completeStage,
  enterStage,
  initialState,
  recordCriticRound,
  reopenStage,
  specEdited,
  stageForSpec,
} from './orchestrator';

const base = () => initialState('p', '/tmp/p');
const status = (s: ReturnType<typeof base>) =>
  Object.fromEntries(Object.entries(s.stages).map(([k, v]) => [k, v.status]));

test('initial: setup complete, ideation active, rest locked', () => {
  expect(status(base())).toMatchObject({
    setup: 'complete',
    ideation: 'active',
    design: 'locked',
    shipping: 'locked',
  });
});

test('completing a stage unlocks the next and moves current', () => {
  const s = completeStage(base(), 'ideation');
  expect(status(s)).toMatchObject({ ideation: 'complete', design: 'active' });
  expect(s.current).toBe('design');
});

test('locked and already-complete stages cannot be completed; locked cannot be entered', () => {
  expect(() => completeStage(base(), 'design')).toThrowError(/locked/);
  expect(() =>
    completeStage(completeStage(base(), 'ideation'), 'ideation'),
  ).toThrowError(/complete/);
  expect(() => enterStage(base(), 'planning')).toThrow();
  try {
    enterStage(base(), 'planning');
  } catch (e) {
    expect((e as { code: string }).code).toBe('STAGE_LOCKED');
  }
});

test('stale propagation: editing a completed stage marks later completed stages stale, not locked ones', () => {
  let s = base();
  for (const id of ['ideation', 'design', 'planning'] as const)
    s = completeStage(s, id);
  // connectors is now active (unlocked), implementation still locked
  const edited = specEdited(s, 'ideation');
  expect(status(edited)).toMatchObject({
    ideation: 'complete',
    design: 'stale',
    planning: 'stale',
    connectors: 'active',
    implementation: 'locked',
  });
  expect(specEdited(edited, 'ideation')).toBe(edited); // idempotent: no new object
});

test('stale stage can be re-confirmed; reopen makes later stages stale', () => {
  let s = base();
  for (const id of ['ideation', 'design'] as const) s = completeStage(s, id);
  s = specEdited(s, 'ideation');
  s = completeStage(s, 'design'); // confirm
  expect(s.stages.design.status).toBe('complete');
  s = reopenStage(s, 'ideation');
  expect(status(s)).toMatchObject({ ideation: 'active', design: 'stale' });
  expect(() => reopenStage(s, 'ideation')).toThrow();
});

test('override reason is stored; critic rounds count and reset on a new visit', () => {
  let s = completeStage(base(), 'ideation', 'blockers are out of scope');
  expect(s.stages.ideation.override?.reason).toBe('blockers are out of scope');
  s = recordCriticRound(recordCriticRound(s, 'design'), 'design');
  expect(s.stages.design.criticRounds).toBe(2);
  s = enterStage(s, 'ideation');
  s = enterStage(s, 'design');
  expect(s.stages.design.criticRounds).toBe(0);
});

test('spec file to stage mapping', () => {
  expect(stageForSpec('docs/PRD.md')).toBe('ideation');
  expect(stageForSpec('docs/design/tokens.json')).toBe('design');
  expect(stageForSpec('docs/PHASES.md')).toBe('planning');
  expect(stageForSpec('docs/TOOLING.md')).toBeUndefined();
});

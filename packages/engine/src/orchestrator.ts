import {
  type ProjectState,
  STAGE_IDS,
  type StageId,
  type StageRecord,
} from '@awp/protocol';
import { EngineError } from './errors';

const idx = (s: StageId) => STAGE_IDS.indexOf(s);
const later = (s: StageId) => STAGE_IDS.slice(idx(s) + 1);
const rec = (status: StageRecord['status']): StageRecord => ({
  status,
  criticRounds: 0,
  override: null,
});

/** Which stage a spec file under docs/ belongs to (for stale propagation). */
export function stageForSpec(file: string): StageId | undefined {
  const f = file.replace(/\\/g, '/').replace(/^docs\//, '');
  if (f === 'PRD.md') return 'ideation';
  if (f === 'DESIGN.md' || f.startsWith('design/tokens')) return 'design';
  if (f === 'ARCHITECTURE.md' || f === 'PHASES.md') return 'planning';
  return undefined;
}

export function initialState(
  name: string,
  path: string,
  now = new Date(),
): ProjectState {
  const stages = Object.fromEntries(
    STAGE_IDS.map((s) => [
      s,
      rec(s === 'setup' ? 'complete' : s === 'ideation' ? 'active' : 'locked'),
    ]),
  ) as ProjectState['stages'];
  return {
    schemaVersion: 1,
    project: { name, mode: 'greenfield', path },
    current: 'ideation',
    stages,
    execution: { mode: 'phased' },
    phases: [],
    updatedAt: now.toISOString(),
  };
}

// All transitions are pure: they return a new state or throw an EngineError.
const clone = (s: ProjectState): ProjectState => structuredClone(s);

export function enterStage(state: ProjectState, stage: StageId): ProjectState {
  if (state.stages[stage].status === 'locked')
    throw new EngineError(
      'STAGE_LOCKED',
      `${stage} is locked`,
      'Finish the previous stage first.',
    );
  const s = clone(state);
  if (s.current !== stage) {
    s.current = stage;
    s.stages[stage].criticRounds = 0; // rounds count per stage visit
  }
  return s;
}

export function completeStage(
  state: ProjectState,
  stage: StageId,
  overrideReason?: string,
  now = new Date(),
): ProjectState {
  const cur = state.stages[stage].status;
  if (cur === 'locked' || cur === 'complete')
    throw new EngineError('STAGE_NOT_ACTIVE', `${stage} is ${cur}`);
  const s = clone(state);
  s.stages[stage].status = 'complete';
  if (overrideReason)
    s.stages[stage].override = {
      reason: overrideReason,
      at: now.toISOString(),
    };
  // Completing N unlocks N+1 (a stale/complete next stage keeps its status).
  const next = later(stage)[0];
  if (next && s.stages[next].status === 'locked') {
    s.stages[next].status = 'active';
    s.current = next;
  }
  return s;
}

export function reopenStage(state: ProjectState, stage: StageId): ProjectState {
  const cur = state.stages[stage].status;
  if (cur !== 'complete' && cur !== 'stale')
    throw new EngineError('STAGE_NOT_COMPLETE', `${stage} is ${cur}`);
  const s = clone(state);
  s.stages[stage].status = 'active';
  s.stages[stage].override = null;
  s.current = stage;
  return markLaterStale(s, stage);
}

function markLaterStale(s: ProjectState, stage: StageId): ProjectState {
  for (const l of later(stage))
    if (s.stages[l].status === 'complete') s.stages[l].status = 'stale';
  return s;
}

/** A spec of `stage` was edited: every later completed stage becomes stale. */
export function specEdited(state: ProjectState, stage: StageId): ProjectState {
  const s = markLaterStale(clone(state), stage);
  return JSON.stringify(s.stages) === JSON.stringify(state.stages) ? state : s;
}

export function recordCriticRound(
  state: ProjectState,
  stage: StageId,
): ProjectState {
  const s = clone(state);
  s.stages[stage].criticRounds += 1;
  return s;
}

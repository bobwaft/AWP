import { z } from 'zod';

export const STAGE_IDS = [
  'setup',
  'ideation',
  'design',
  'planning',
  'connectors',
  'implementation',
  'testing',
  'security',
  'polishing',
  'shipping',
] as const;
export const StageId = z.enum(STAGE_IDS);
export type StageId = z.infer<typeof StageId>;

export const StageStatus = z.enum(['locked', 'active', 'complete', 'stale']);
export type StageStatus = z.infer<typeof StageStatus>;

export const StageRecord = z.object({
  status: StageStatus,
  criticRounds: z.number().int().default(0),
  readiness: z.number().optional(),
  override: z
    .object({ reason: z.string(), at: z.string() })
    .nullable()
    .default(null),
});
export type StageRecord = z.infer<typeof StageRecord>;

export const PhaseRecord = z.object({
  n: z.number().int(),
  title: z.string(),
  status: z.enum([
    'pending',
    'running',
    'verifying',
    'awaiting_test',
    'fixing',
    'passed',
    'deferred',
    'built',
  ]),
  commit: z.string().optional(),
  tag: z.string().optional(),
});
export type PhaseRecord = z.infer<typeof PhaseRecord>;

export const ProjectState = z.object({
  schemaVersion: z.literal(1),
  project: z.object({
    name: z.string(),
    mode: z.literal('greenfield'),
    path: z.string(),
  }),
  /** Stage the user was last viewing; reopening lands here. */
  current: StageId,
  stages: z.record(StageId, StageRecord),
  execution: z.object({ mode: z.enum(['phased', 'oneshot']) }),
  phases: z.array(PhaseRecord),
  updatedAt: z.string(),
});
export type ProjectState = z.infer<typeof ProjectState>;

export const ProjectSummary = z.object({
  path: z.string(),
  name: z.string(),
  stage: StageId.optional(),
  phasesPassed: z.number(),
  phasesTotal: z.number(),
  lastActivity: z.string().optional(),
  openBugs: z.number(),
  missing: z.boolean().default(false),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

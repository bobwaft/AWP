export type StageState = 'locked' | 'current' | 'done' | 'stale';

export type Stage = { n: number; label: string; part: string };

// DESIGN.md §2.2
export const STAGES: Stage[] = [
  { n: 1, label: 'Setup', part: 'Case' },
  { n: 2, label: 'Ideation', part: 'Chamber' },
  { n: 3, label: 'Design', part: 'Scope' },
  { n: 4, label: 'Planning', part: 'Bipod' },
  { n: 5, label: 'Connectors', part: 'Rail' },
  { n: 6, label: 'Implementation', part: 'Barrel' },
  { n: 7, label: 'Testing', part: 'Scope check' },
  { n: 8, label: 'Security', part: 'Safety' },
  { n: 9, label: 'Polishing', part: 'Muzzle' },
  { n: 10, label: 'Shipping', part: 'Target' },
];

// Keys 1–9 jump to stages 1–9, 0 to stage 10.
export const stageForKey = (key: string): number | undefined =>
  /^[0-9]$/.test(key) ? (key === '0' ? 10 : Number(key)) : undefined;

export const stageKeyLabel = (n: number) => (n === 10 ? '0' : String(n));

// Mock data until the engine exists (Phase 2/5).
export const MOCK_PROJECT = { name: 'Demo project', current: 4, stale: [3] };

export function mockStageState(n: number): StageState {
  const { current, stale } = MOCK_PROJECT;
  if (stale.includes(n)) return 'stale';
  if (n === current) return 'current';
  return n < current ? 'done' : 'locked';
}

export const stageAriaLabel = (s: Stage, state: StageState) =>
  `Stage ${s.n}, ${s.label}, ${state}`;

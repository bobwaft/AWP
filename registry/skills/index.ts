import awpInterview from './awp-interview';
import awpPhaseRunner from './awp-phase-runner';
import awpSecurityReview from './awp-security-review';
import awpTestChecklist from './awp-test-checklist';

/**
 * Skill folders that ship inside AWP, as TS string modules so they bundle the same under Bun and
 * Vite (the prompt library does the same). Each maps file path -> text.
 */
export const BUNDLED_SKILLS: Record<string, Record<string, string>> = {
  'awp-interview': awpInterview,
  'awp-phase-runner': awpPhaseRunner,
  'awp-test-checklist': awpTestChecklist,
  'awp-security-review': awpSecurityReview,
};

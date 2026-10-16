import bugReport from '../forms/bug_report.json';
import featureSpec from '../forms/feature_spec.json';
import stackConstraints from '../forms/stack_constraints.json';
import prdSections from '../schemas/prd.sections.json';
import ideationCritic from './library/ideation.critic';
import ideationInterviewer from './library/ideation.interviewer';
import ideationSynthesizer from './library/ideation.synthesizer';
import { type Prompt, parsePrompt, render } from './prompt';

export const name = '@awp/prompts';
export { type Prompt, parsePrompt, render };

const LIBRARY: Record<string, string> = {
  'ideation.interviewer': ideationInterviewer,
  'ideation.synthesizer': ideationSynthesizer,
  'ideation.critic': ideationCritic,
};

export type FormTemplate = { id: string; title: string; fields: unknown[] };
export const FORM_TEMPLATES: Record<string, FormTemplate> = {
  feature_spec: featureSpec,
  stack_constraints: stackConstraints,
  bug_report: bugReport,
};

export type SectionSchema = {
  id: string;
  file: string;
  sections: { id: string; title: string; required: boolean }[];
};
export const SECTION_SCHEMAS: Record<string, SectionSchema> = {
  prd: prdSections,
};

export function registerPrompt(id: string, src: string) {
  LIBRARY[id] = src;
}

/** Loads a prompt; a per-project override (`.awp/prompts/<id>.md` content) wins when given. */
export function loadPrompt(id: string, override?: string): Prompt {
  const src = override ?? LIBRARY[id];
  if (!src) throw new Error(`Unknown prompt: ${id}`);
  return parsePrompt(src);
}
export const promptIds = () => Object.keys(LIBRARY);

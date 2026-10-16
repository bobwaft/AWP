import type { StageId } from '@awp/protocol';

export type SpecStageConfig = {
  stage: StageId;
  specFile: string;
  schemaId: string; // key in SECTION_SCHEMAS
  prompts: { interviewer: string; synthesizer: string; critic: string };
  /** Tool allowlists per phase (MCP tools are namespaced mcp__awp__*). */
  tools: { interviewer: string[]; synthesizer: string[]; critic: string[] };
  maxRounds: number;
};

export const SPEC_STAGES: Partial<Record<StageId, SpecStageConfig>> = {
  ideation: {
    stage: 'ideation',
    specFile: 'docs/PRD.md',
    schemaId: 'prd',
    prompts: {
      interviewer: 'ideation.interviewer',
      synthesizer: 'ideation.synthesizer',
      critic: 'ideation.critic',
    },
    tools: {
      interviewer: [
        'Read',
        'mcp__awp__ask_user',
        'mcp__awp__request_form',
        'mcp__awp__remember',
      ],
      synthesizer: ['Read', 'Edit(docs/PRD.md)', 'Write(docs/PRD.md)'],
      critic: ['Read', 'mcp__awp__submit_critique'],
    },
    maxRounds: 3,
  },
};

import type { StageId } from '@awp/protocol';

export type SpecStageConfig = {
  stage: StageId;
  specFile: string;
  schemaId: string; // key in SECTION_SCHEMAS
  prompts: { interviewer: string; synthesizer: string; critic: string };
  /** Tool allowlists per phase (MCP tools are namespaced mcp__awp__*). */
  tools: { interviewer: string[]; synthesizer: string[]; critic: string[] };
  maxRounds: number;
  /** 'design': the synthesizer slot is the themer and the critic waits for a picked theme. */
  mode?: 'prose' | 'design' | 'planning';
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
  design: {
    stage: 'design',
    specFile: 'docs/DESIGN.md',
    schemaId: 'design',
    mode: 'design',
    prompts: {
      interviewer: 'design.interviewer',
      synthesizer: 'design.themer',
      critic: 'design.critic',
    },
    tools: {
      interviewer: [
        'Read',
        'mcp__awp__ask_user',
        'mcp__awp__request_form',
        'mcp__awp__remember',
      ],
      synthesizer: ['Read', 'mcp__awp__submit_themes'],
      critic: ['Read', 'mcp__awp__submit_critique'],
    },
    maxRounds: 3,
  },
  planning: {
    stage: 'planning',
    specFile: 'docs/ARCHITECTURE.md',
    schemaId: 'planning',
    mode: 'planning',
    prompts: {
      interviewer: 'planning.architect',
      synthesizer: 'planning.phaser',
      critic: 'planning.critic',
    },
    tools: {
      interviewer: [
        'Read',
        'mcp__awp__ask_user',
        'mcp__awp__request_form',
        'mcp__awp__remember',
        'mcp__awp__submit_stack_options',
      ],
      synthesizer: ['Read', 'mcp__awp__submit_phase_plan'],
      critic: ['Read', 'mcp__awp__submit_critique'],
    },
    maxRounds: 3,
  },
};

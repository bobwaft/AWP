import { CritiqueInput, FormRequest } from '@awp/protocol';
import { z } from 'zod';

// Tool definitions shared by the MCP stdio proxy (what the agent sees) and the in-process ToolHost.
export const TOOLS = {
  ask_user: {
    description:
      'Ask the user one question and wait for the answer. Pass "choices" when the answer is one of a few options.',
    input: z.object({
      question: z.string().min(1),
      choices: z.array(z.string()).optional(),
    }),
  },
  request_form: {
    description:
      'Ask for structured input (3+ fields). Use a templateId (feature_spec, stack_constraints, bug_report, design_schema) or ad-hoc fields. Blocks until the user submits, declines, or asks about the form. Returns {status:"submitted",values,unsure} | {status:"declined"} | {status:"question",text,draft}.',
    input: FormRequest,
  },
  submit_critique: {
    description:
      'Report open questions (blocking or not) and a 0-100 readiness score per required section.',
    input: CritiqueInput,
  },
  remember: {
    description: 'Append a durable fact, decision or gotcha to MEMORY.md.',
    input: z.object({ fact: z.string().min(1) }),
  },
  approve_permission: {
    description:
      'Claude Code permission prompt: forwards an out-of-policy tool use to the user.',
    input: z.object({
      tool_name: z.string(),
      input: z.unknown(),
      tool_use_id: z.string().optional(),
    }),
  },
  // Later phases implement these; calling them now returns NOT_AVAILABLE.
  submit_themes: {
    description: 'Design stage: 2-3 theme proposals.',
    input: z.unknown(),
  },
  submit_stack_options: {
    description: 'Planning stage: stack options.',
    input: z.unknown(),
  },
  submit_phase_plan: {
    description: 'Planning stage: the phase plan.',
    input: z.unknown(),
  },
  submit_suggestions: {
    description: 'Connectors: registry suggestions.',
    input: z.unknown(),
  },
  report_phase_result: {
    description: 'Phase runner: what was built.',
    input: z.unknown(),
  },
  log_bug: {
    description: 'Testing: write a BUGS.md entry.',
    input: z.unknown(),
  },
  update_bug: {
    description: 'Testing: update a BUGS.md entry.',
    input: z.unknown(),
  },
} as const;

export type ToolName = keyof typeof TOOLS;
export const isToolName = (n: string): n is ToolName => n in TOOLS;

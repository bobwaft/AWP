import { z } from 'zod';
import { DesignTokens, Theme } from './design';
import { StackOption, VerifyCommands } from './planning';

export const FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'boolean',
  'select',
  'multiselect',
  'color',
  'font',
  'file',
  'url',
  'list',
] as const;

export type FormField = {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  type: (typeof FIELD_TYPES)[number];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  pattern?: string;
  /** `list` only: the sub-fields of each repeated row. */
  fields?: FormField[];
  /** Spec section this field fills, e.g. "prd.features". */
  fills?: string;
};

// Strict: anything outside this subset is rejected and the agent gets the schema error back.
export const FormField: z.ZodType<FormField> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
      label: z.string().min(1),
      help: z.string().optional(),
      required: z.boolean().optional(),
      type: z.enum(FIELD_TYPES),
      options: z
        .array(z.object({ value: z.string(), label: z.string() }).strict())
        .optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      fields: z.array(FormField).optional(),
      fills: z.string().optional(),
    })
    .strict(),
);

export const FormValues = z.record(z.string(), z.unknown());
export type FormValues = z.infer<typeof FormValues>;

export const FORM_TEMPLATES = [
  'feature_spec',
  'stack_constraints',
  'bug_report',
  'design_schema',
] as const;

export const FormRequest = z
  .object({
    templateId: z.enum(FORM_TEMPLATES).optional(),
    title: z.string().min(1),
    fields: z.array(FormField).optional(),
    prefill: FormValues.optional(),
  })
  .refine((r) => r.templateId || r.fields?.length, {
    message: 'Provide templateId or fields',
  });
export type FormRequest = z.infer<typeof FormRequest>;

export const FormRequested = z.object({
  formId: z.string(),
  title: z.string(),
  templateId: z.string().optional(),
  fields: z.array(FormField),
  prefill: FormValues.optional(),
  /** Field ids the agent filled; flagged until the user edits them. */
  aiFilled: z.array(z.string()),
  /** The run ended while this form was open; submitting starts a new turn. */
  orphaned: z.boolean().default(false),
});
export type FormRequested = z.infer<typeof FormRequested>;

export const FormResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('submitted'),
    values: FormValues,
    unsure: z.array(z.string()),
  }),
  z.object({ status: z.literal('declined') }),
  z.object({
    status: z.literal('question'),
    text: z.string(),
    draft: FormValues,
  }),
]);
export type FormResult = z.infer<typeof FormResult>;

export const Question = z.object({
  questionId: z.string(),
  text: z.string(),
  choices: z.array(z.string()).optional(),
});
export type Question = z.infer<typeof Question>;

export const CritiqueInput = z.object({
  questions: z.array(
    z.object({
      text: z.string().min(1),
      blocking: z.boolean(),
      section: z.string().optional(),
    }),
  ),
  /** Per required section, 0-100. */
  readiness: z.record(z.string(), z.number().min(0).max(100)),
});
export type CritiqueInput = z.infer<typeof CritiqueInput>;

export const Critique = z.object({
  round: z.number().int(),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      blocking: z.boolean(),
      section: z.string().optional(),
    }),
  ),
  readiness: z.record(z.string(), z.number()),
});
export type Critique = z.infer<typeof Critique>;

export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'form']),
  text: z.string(),
  ts: z.string(),
  form: z
    .object({
      title: z.string(),
      templateId: z.string().optional(),
      values: FormValues,
    })
    .optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const PermissionRequest = z.object({
  requestId: z.string(),
  tool: z.string(),
  input: z.unknown(),
});
export type PermissionRequest = z.infer<typeof PermissionRequest>;

export const SpecPhase = z.enum([
  'interviewer',
  'synthesizer',
  'themer',
  'phaser',
  'critic',
]);
export type SpecPhase = z.infer<typeof SpecPhase>;

export const SpecSnapshot = z.object({
  stage: z.string(),
  specFile: z.string(),
  busy: SpecPhase.nullable(),
  chat: z.array(ChatMessage),
  critique: Critique.nullable(),
  /** Critic rounds this visit (cap 3). */
  rounds: z.number().int(),
  /** Overall 0-100, informational only. */
  readiness: z.number().nullable(),
  /** Blocking questions still open; gate is open at 0 once a round has run. */
  blocking: z.number().int(),
  pending: z.object({
    question: Question.nullable(),
    form: FormRequested.nullable(),
    permission: PermissionRequest.nullable(),
  }),
  /** Fields the user marked "Not sure" (fed to the critic). */
  unsure: z.array(
    z.object({
      fieldId: z.string(),
      label: z.string(),
      fills: z.string().optional(),
    }),
  ),
  declined: z.array(z.string()),
  /** Design stage: proposed themes and the one picked (tokens as written to docs). */
  themes: z.array(Theme).nullable(),
  picked: z
    .object({ themeId: z.string(), name: z.string(), tokens: DesignTokens })
    .nullable(),
  /** Planning stage: stack proposals and the chosen one (with its final verify commands). */
  stackOptions: z.array(StackOption).nullable(),
  stackPicked: z
    .object({ optionId: z.string(), name: z.string(), verify: VerifyCommands })
    .nullable(),
});
export type SpecSnapshot = z.infer<typeof SpecSnapshot>;

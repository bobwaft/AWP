import { z } from 'zod';
import { AdapterId, AgentEvent } from './agent';
import { DesignRefs } from './design';
import { Phase, VerifyCommands } from './planning';
import { ProjectState, ProjectSummary, StageId } from './project';
import { SetupDetectResult } from './setup';
import { FormValues, SpecSnapshot } from './spec';

export * from './agent';
export * from './design';
export * from './form-validate';
export * from './planning';
export * from './project';
export * from './setup';
export * from './spec';

export const name = '@awp/protocol';

const Id = z.union([z.string(), z.number()]);

export const RpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: Id,
  method: z.string(),
  params: z.unknown().optional(),
});
export const RpcNotification = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
});
/** `data.code` is the stable string code (AGENT_NOT_FOUND, GATE_BLOCKED, ...). */
export const RpcError = z.object({
  code: z.number(),
  message: z.string(),
  data: z.object({ code: z.string(), hint: z.string().optional() }).optional(),
});
export const RpcResponse = z.object({
  jsonrpc: z.literal('2.0'),
  id: Id.nullable(),
  result: z.unknown().optional(),
  error: RpcError.optional(),
});
export type RpcRequest = z.infer<typeof RpcRequest>;
export type RpcResponse = z.infer<typeof RpcResponse>;
export type RpcError = z.infer<typeof RpcError>;

export const ErrorCode = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

// Request methods: params/result schemas. Later phases add their methods here.
export const methods = {
  ping: { params: z.undefined().or(z.object({})), result: z.literal('pong') },
  version: {
    params: z.undefined().or(z.object({})),
    result: z.object({ version: z.string() }),
  },
  'setup.detect': {
    params: z.undefined().or(z.object({})),
    result: SetupDetectResult,
  },
  // PATH re-read from the registry on Windows; UI passes it to new terminal tabs.
  'setup.freshEnv': {
    params: z.undefined().or(z.object({})),
    result: z.record(z.string(), z.string()),
  },
  'project.create': {
    params: z.object({ path: z.string().min(1), name: z.string().min(1) }),
    result: ProjectState,
  },
  'project.open': {
    params: z.object({ path: z.string().min(1) }),
    result: ProjectState,
  },
  'project.list': {
    params: z.undefined().or(z.object({})),
    result: z.array(ProjectSummary),
  },
  'stage.enter': { params: z.object({ stage: StageId }), result: ProjectState },
  'stage.complete': {
    params: z.object({ stage: StageId, overrideReason: z.string().optional() }),
    result: ProjectState,
  },
  'stage.reopen': {
    params: z.object({ stage: StageId }),
    result: ProjectState,
  },
  'spec.get': { params: z.object({ stage: StageId }), result: SpecSnapshot },
  'spec.read': {
    params: z.object({ file: z.string() }),
    // `base` = the document as it was before the AI's last edit (for the diff view).
    result: z.object({ content: z.string(), base: z.string().nullable() }),
  },
  'spec.save': {
    params: z.object({ file: z.string(), content: z.string() }),
    result: z.literal('ok'),
  },
  'chat.send': {
    params: z.object({
      stage: StageId,
      text: z.string().min(1),
      attachments: z.array(z.string()).optional(),
    }),
    result: z.object({ runId: z.string() }),
  },
  'question.answer': {
    params: z.object({ questionId: z.string(), answer: z.string() }),
    result: z.literal('ok'),
  },
  'form.submit': {
    params: z.object({
      formId: z.string(),
      values: FormValues,
      unsure: z.array(z.string()).default([]),
    }),
    result: z.literal('ok'),
  },
  'form.decline': {
    params: z.object({ formId: z.string() }),
    result: z.literal('ok'),
  },
  'form.saveDraft': {
    params: z.object({ formId: z.string(), values: FormValues }),
    result: z.literal('ok'),
  },
  'form.ask': {
    params: z.object({
      formId: z.string(),
      text: z.string().min(1),
      draft: FormValues,
    }),
    result: z.literal('ok'),
  },
  'permission.decide': {
    params: z.object({
      requestId: z.string(),
      allow: z.boolean(),
      message: z.string().optional(),
    }),
    result: z.literal('ok'),
  },
  'design.refs': { params: z.undefined().or(z.object({})), result: DesignRefs },
  'design.addRef': {
    params: z.object({ source: z.string().min(1) }),
    result: DesignRefs,
  },
  'design.propose': {
    params: z.object({ feedback: z.string().optional() }),
    result: z.literal('ok'),
  },
  'design.pickTheme': {
    params: z.object({
      themeId: z.string(),
      /** Skips the design-schema form and writes the docs immediately. */
      tweaks: z.record(z.string(), z.unknown()).optional(),
    }),
    result: z.literal('ok'),
  },
  'plan.propose': {
    params: z.object({ feedback: z.string().optional() }),
    result: z.literal('ok'),
  },
  'plan.pickStack': {
    params: z.object({
      optionId: z.string(),
      /** Owner edits: replace verify commands, add notes. */
      edits: z
        .object({
          verify: VerifyCommands.partial().optional(),
          notes: z.string().optional(),
        })
        .optional(),
    }),
    result: z.literal('ok'),
  },
  'plan.phases': {
    params: z.undefined().or(z.object({})),
    result: z.object({
      phases: z.array(Phase),
      errors: z.array(z.string()),
      text: z.string(),
    }),
  },
  'plan.savePhases': {
    params: z.object({ phases: z.array(Phase) }),
    result: z.object({ errors: z.array(z.string()) }),
  },
  'agent.run': {
    params: z.object({
      prompt: z.string().min(1),
      cwd: z.string(),
      adapter: AdapterId.default('claude'),
      model: z.string().optional(),
      fixture: z.string().optional(), // fake adapter only
    }),
    result: z.object({ runId: z.string() }),
  },
  'agent.stop': {
    params: z.object({ runId: z.string() }),
    result: z.literal('ok'),
  },
} as const;
export type Methods = typeof methods;
export type MethodName = keyof Methods;
export type Params<M extends MethodName> = z.infer<Methods[M]['params']>;
export type Result<M extends MethodName> = z.infer<Methods[M]['result']>;

// Notifications: engine -> UI. `engine.*` ones are emitted by the Rust supervisor.
export const notifications = {
  // Stubs: payloads tightened by the phases that emit them.
  'run.event': z.object({ runId: z.string(), event: AgentEvent }),
  'state.changed': ProjectState,
  'spec.changed': z.object({ file: z.string() }),
  'spec.state': SpecSnapshot,
  'question.asked': z.unknown(),
  'form.requested': z.unknown(),
  'permission.requested': z.unknown(),
  toast: z.object({
    level: z.enum(['info', 'warn', 'error']),
    text: z.string(),
  }),
  'engine.restarted': z.object({}),
  'engine.failed': z.object({ reason: z.string() }),
} as const;
export type NotificationName = keyof typeof notifications;

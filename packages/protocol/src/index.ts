import { z } from 'zod';
import { AdapterId, AgentEvent } from './agent';

import { ProjectState, ProjectSummary, StageId } from './project';
import { SetupDetectResult } from './setup';

export * from './agent';
export * from './project';
export * from './setup';

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

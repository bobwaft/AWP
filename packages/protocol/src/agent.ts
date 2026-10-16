import { z } from 'zod';

export const AgentEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session'),
    sessionId: z.string(),
    model: z.string().optional(),
  }),
  z.object({
    type: z.literal('message'),
    role: z.literal('assistant'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool_call'),
    name: z.string(),
    input: z.unknown(),
    id: z.string(),
  }),
  z.object({
    type: z.literal('tool_result'),
    id: z.string(),
    ok: z.boolean(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal('file_change'),
    path: z.string(),
    kind: z.enum(['add', 'edit', 'delete']),
  }),
  z.object({
    type: z.literal('command'),
    cmd: z.string(),
    exitCode: z.number().optional(),
  }),
  z.object({
    type: z.literal('usage'),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number().optional(),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({
    type: z.literal('done'),
    status: z.enum(['success', 'error', 'stopped']),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEvent>;

export const RunRequest = z.object({
  runId: z.string(),
  cwd: z.string(), // project root; agent confined here
  prompt: z.string(),
  systemAppend: z.string().optional(),
  model: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  mcpConfigPath: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
});
export type RunRequest = z.infer<typeof RunRequest>;

export const AdapterId = z.enum(['claude', 'fake']);
export type AdapterId = z.infer<typeof AdapterId>;

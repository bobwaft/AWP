import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TOOLS, type ToolName } from './mcp-tools';

// Tools the agent sees right now; the rest are reserved for later phases.
export const ACTIVE_TOOLS: ToolName[] = [
  'ask_user',
  'request_form',
  'submit_critique',
  'remember',
  'approve_permission',
  'submit_themes',
  'submit_stack_options',
  'submit_phase_plan',
  'submit_suggestions',
];

export function toolList() {
  return ACTIVE_TOOLS.map((name) => {
    const { description, input } = TOOLS[name];
    let inputSchema: Record<string, unknown>;
    try {
      inputSchema = z.toJSONSchema(input as z.ZodType, {
        unrepresentable: 'any',
      }) as Record<string, unknown>;
    } catch {
      inputSchema = { type: 'object' };
    }
    return {
      name,
      description,
      inputSchema: { ...inputSchema, type: 'object' },
    };
  });
}

/** `awp-engine mcp`: stdio MCP server that proxies every call to the engine's localhost bridge. */
export async function runMcpServer(env = process.env) {
  const url = env.AWP_BRIDGE_URL;
  const token = env.AWP_BRIDGE_TOKEN;
  const runId = env.AWP_RUN_ID;
  if (!url || !token || !runId)
    throw new Error(
      'AWP_BRIDGE_URL, AWP_BRIDGE_TOKEN and AWP_RUN_ID are required',
    );

  const server = new Server(
    { name: 'awp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolList(),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const res = await fetch(`${url}/tool`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ runId, name, args: args ?? {} }),
    });
    const body = (await res.json()) as
      | { ok: true; result: unknown }
      | { ok: false; error: { code: string; message: string; hint?: string } };
    if (!body.ok)
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `${body.error.code}: ${body.error.message}${body.error.hint ? ` (${body.error.hint})` : ''}`,
          },
        ],
      };
    return { content: [{ type: 'text', text: JSON.stringify(body.result) }] };
  });
  await server.connect(new StdioServerTransport());
}

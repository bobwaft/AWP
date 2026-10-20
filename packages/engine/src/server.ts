import {
  ErrorCode,
  type MethodName,
  methods,
  RpcNotification,
  RpcRequest,
  type RpcResponse,
} from '@awp/protocol';

import { EngineError } from './errors';

export type Handlers = { [M in MethodName]?: (params: unknown) => unknown };

const reply = (r: Omit<RpcResponse, 'jsonrpc'>) =>
  JSON.stringify({ jsonrpc: '2.0', ...r });
const fail = (
  id: RpcResponse['id'],
  code: number,
  stable: string,
  message: string,
  hint?: string,
) =>
  reply({
    id,
    error: { code, message, data: { code: stable, ...(hint ? { hint } : {}) } },
  });

/** Takes one NDJSON line, returns the response line (or undefined for notifications). */
export function createHandler(
  handlers: Handlers,
  log: (msg: string) => void = () => {},
) {
  const inner = handleLine(handlers, log);
  return async (line: string): Promise<string | undefined> => {
    const out = await inner(line);
    // One log line per failed request: method, code, message; never params (secrets).
    if (out?.includes('"error"')) {
      try {
        const r = JSON.parse(out) as RpcResponse;
        if (r.error) {
          let method = '?';
          try {
            method = String(JSON.parse(line)?.method ?? '?');
          } catch {}
          log(
            `failed ${method}: ${(r.error.data as { code?: string } | undefined)?.code ?? r.error.code} ${r.error.message}`,
          );
        }
      } catch {}
    }
    return out;
  };
}

function handleLine(handlers: Handlers, log: (msg: string) => void) {
  return async (line: string): Promise<string | undefined> => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return fail(null, ErrorCode.parse, 'PARSE_ERROR', 'Invalid JSON');
    }
    // JSON-RPC notifications (no id) get no reply.
    if (RpcNotification.safeParse(raw).success && !(raw as { id?: unknown }).id)
      return undefined;
    const req = RpcRequest.safeParse(raw);
    if (!req.success)
      return fail(
        null,
        ErrorCode.invalidRequest,
        'INVALID_REQUEST',
        'Invalid request',
      );
    const { id, method, params } = req.data;
    const schema = methods[method as MethodName];
    const handler = handlers[method as MethodName];
    if (!schema || !handler)
      return fail(
        id,
        ErrorCode.methodNotFound,
        'METHOD_NOT_FOUND',
        `The engine does not know "${method}" (it may be out of date).`,
        'Fully restart AWP: close the window and run `bun run dev` again.',
      );
    // The Rust bridge sends `params: null` for calls without params.
    const parsed = schema.params.safeParse(params ?? undefined);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
      return fail(
        id,
        ErrorCode.invalidParams,
        'INVALID_PARAMS',
        `${method}: ${issue?.message ?? 'invalid params'}${where}`,
      );
    }
    try {
      return reply({ id, result: await handler(parsed.data) });
    } catch (e) {
      if (e instanceof EngineError)
        return reply({
          id,
          error: {
            code: -32000,
            message: e.message,
            data: { code: e.code, hint: e.hint },
          },
        });
      log(
        `error in ${method}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
      );
      return fail(id, ErrorCode.internal, 'INTERNAL', 'Internal error');
    }
  };
}

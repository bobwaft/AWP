import {
  ErrorCode,
  type MethodName,
  methods,
  RpcNotification,
  RpcRequest,
  type RpcResponse,
} from '@awp/protocol';

export type Handlers = { [M in MethodName]?: (params: unknown) => unknown };

const reply = (r: Omit<RpcResponse, 'jsonrpc'>) =>
  JSON.stringify({ jsonrpc: '2.0', ...r });
const fail = (
  id: RpcResponse['id'],
  code: number,
  stable: string,
  message: string,
) => reply({ id, error: { code, message, data: { code: stable } } });

/** Takes one NDJSON line, returns the response line (or undefined for notifications). */
export function createHandler(
  handlers: Handlers,
  log: (msg: string) => void = () => {},
) {
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
      return fail(id, ErrorCode.methodNotFound, 'METHOD_NOT_FOUND', method);
    if (!schema.params.safeParse(params).success)
      return fail(id, ErrorCode.invalidParams, 'INVALID_PARAMS', method);
    try {
      return reply({ id, result: await handler(params) });
    } catch (e) {
      log(
        `error in ${method}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
      );
      return fail(id, ErrorCode.internal, 'INTERNAL', 'Internal error');
    }
  };
}

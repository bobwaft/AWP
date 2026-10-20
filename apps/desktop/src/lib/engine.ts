import {
  type MethodName,
  methods,
  type NotificationName,
  notifications,
  type Params,
  type Result,
  RpcResponse,
} from '@awp/protocol';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** What the user can do about it, when the engine knows. */
    readonly hint?: string,
  ) {
    super(message);
  }
}

async function call<M extends MethodName>(
  method: M,
  params?: Params<M>,
): Promise<Result<M>> {
  let raw: unknown;
  try {
    raw = await invoke('engine_request', { method, params });
  } catch (e) {
    throw new EngineError(String(e), 'ENGINE_UNAVAILABLE');
  }
  const res = RpcResponse.safeParse(raw);
  if (!res.success)
    throw new EngineError('Malformed engine response', 'BAD_RESPONSE');
  const { error, result } = res.data;
  if (error)
    throw new EngineError(
      error.message,
      error.data?.code ?? 'UNKNOWN',
      error.data?.hint,
    );
  const parsed = methods[method].result.safeParse(result);
  if (!parsed.success)
    throw new EngineError('Malformed engine result', 'BAD_RESPONSE');
  return parsed.data as Result<M>;
}

export type EngineEvent = {
  [N in NotificationName]: { method: N; params: unknown };
}[NotificationName];

/** Subscribes to engine notifications; returns an unsubscribe function. Unknown methods are dropped. */
function on(handler: (e: EngineEvent) => void): () => void {
  const un = listen<{ method: string; params: unknown }>(
    'engine://event',
    ({ payload }) => {
      const schema = notifications[payload.method as NotificationName];
      if (schema?.safeParse(payload.params).success)
        handler(payload as EngineEvent);
    },
  ).catch(() => () => {}); // not running inside Tauri (tests, plain browser)
  return () => void un.then((f) => f());
}

export const engine = { call, on };

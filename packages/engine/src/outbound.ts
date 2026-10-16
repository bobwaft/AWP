import { RpcResponse } from '@awp/protocol';

/** Engine → Rust requests (currently only `secret.get`). Responses arrive on stdin. */
export function createOutbound(
  write: (line: string) => void,
  timeoutMs = 10000,
) {
  let next = 0;
  const pending = new Map<
    number,
    { ok: (v: unknown) => void; err: (e: Error) => void }
  >();

  function call(method: string, params: unknown): Promise<unknown> {
    const id = ++next;
    return new Promise((ok, err) => {
      const t = setTimeout(() => {
        pending.delete(id);
        err(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        ok: (v) => (clearTimeout(t), ok(v)),
        err: (e) => (clearTimeout(t), err(e)),
      });
      write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  /** Returns true when the line was a response to one of our requests. */
  function handleLine(line: string): boolean {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return false;
    }
    if (typeof raw !== 'object' || raw === null || 'method' in raw)
      return false;
    const res = RpcResponse.safeParse(raw);
    if (!res.success || typeof res.data.id !== 'number') return false;
    const p = pending.get(res.data.id);
    if (!p) return false;
    pending.delete(res.data.id);
    if (res.data.error) p.err(new Error(res.data.error.message));
    else p.ok(res.data.result);
    return true;
  }

  return { call, handleLine };
}

export type Outbound = ReturnType<typeof createOutbound>;

/** Reads a keychain secret via the Rust core. Returns null when not set. */
export async function getSecret(
  out: Outbound,
  key: string,
): Promise<string | null> {
  const r = (await out.call('secret.get', { key })) as { value: string | null };
  return r.value;
}

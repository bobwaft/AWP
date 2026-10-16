import { beforeEach, expect, test, vi } from 'vitest';

const invoke = vi.fn();
const listen = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));
const { engine, EngineError } = await import('./engine');

beforeEach(() => vi.resetAllMocks());

test('call returns the validated result', async () => {
  invoke.mockResolvedValue({
    jsonrpc: '2.0',
    id: 1,
    result: { version: '1.2.3' },
  });
  expect(await engine.call('version')).toEqual({ version: '1.2.3' });
  expect(invoke).toHaveBeenCalledWith('engine_request', {
    method: 'version',
    params: undefined,
  });
});

test('rpc error and transport failure become EngineError with codes', async () => {
  invoke.mockResolvedValueOnce({
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32601, message: 'x', data: { code: 'METHOD_NOT_FOUND' } },
  });
  await expect(engine.call('ping')).rejects.toMatchObject({
    code: 'METHOD_NOT_FOUND',
  });
  invoke.mockRejectedValueOnce('engine not running');
  await expect(engine.call('ping')).rejects.toBeInstanceOf(EngineError);
});

test('on forwards valid notifications only', async () => {
  let cb: (e: { payload: unknown }) => void = () => {};
  listen.mockImplementation(async (_n, f) => {
    cb = f;
    return () => {};
  });
  const seen: unknown[] = [];
  engine.on((e) => seen.push(e.method));
  await Promise.resolve();
  cb({ payload: { method: 'engine.restarted', params: {} } });
  cb({ payload: { method: 'bogus', params: {} } });
  cb({ payload: { method: 'toast', params: { level: 'zzz', text: 'x' } } });
  expect(seen).toEqual(['engine.restarted']);
});

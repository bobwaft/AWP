import { expect, test } from 'vitest';
import { createHandler } from './server';

const h = createHandler({
  ping: () => 'pong',
  version: () => ({ version: '9' }),
});
const call = async (o: unknown) =>
  JSON.parse((await h(typeof o === 'string' ? o : JSON.stringify(o)))!);
const req = (method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  params,
});

test('ping and version round-trip', async () => {
  expect((await call(req('ping'))).result).toBe('pong');
  expect((await call(req('version'))).result).toEqual({ version: '9' });
});

test('errors carry stable codes', async () => {
  expect((await call('{nope')).error.data.code).toBe('PARSE_ERROR');
  expect((await call({ id: 1 })).error.data.code).toBe('INVALID_REQUEST');
  expect((await call(req('nope'))).error.data.code).toBe('METHOD_NOT_FOUND');
  expect((await call(req('ping', 5))).error.data.code).toBe('INVALID_PARAMS');
});

test('handler throw becomes INTERNAL without leaking', async () => {
  const bad = createHandler({
    ping: () => {
      throw new Error('secret');
    },
  });
  const r = JSON.parse((await bad(JSON.stringify(req('ping'))))!);
  expect(r.error.data.code).toBe('INTERNAL');
  expect(JSON.stringify(r)).not.toContain('secret');
});

test('notifications (no id) get no reply', async () => {
  expect(
    await h(JSON.stringify({ jsonrpc: '2.0', method: 'ping' })),
  ).toBeUndefined();
});

test('notifications (no id) get no reply', async () => {
  expect(
    await h(JSON.stringify({ jsonrpc: '2.0', method: 'ping' })),
  ).toBeUndefined();
});

test('agent.run on fake adapter returns a runId and applies defaults', async () => {
  const { createHandlers } = await import('./handlers');
  const { FakeAdapter } = await import('./adapters/fake');
  const seen: string[] = [];
  const hh = createHandler(
    createHandlers(
      (m) => seen.push(m),
      () => new FakeAdapter(),
    ),
  );
  const r = JSON.parse(
    (await hh(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'agent.run',
        params: { prompt: 'x', cwd: '/', adapter: 'fake' },
      }),
    ))!,
  );
  expect(typeof r.result.runId).toBe('string');
  await new Promise((r) => setTimeout(r, 100));
  expect(seen).toContain('run.event');
});

test('params: null (Rust bridge) is treated as no params', async () => {
  expect((await call(req('ping', null))).result).toBe('pong');
  expect((await call(req('version', null))).result).toEqual({ version: '9' });
});

test('INVALID_PARAMS names the method and the first issue', async () => {
  const e = (await call(req('version', 5))).error;
  expect(e.data.code).toBe('INVALID_PARAMS');
  expect(e.message).toMatch(/^version: /);
});

test('failed requests are logged without params', async () => {
  const lines: string[] = [];
  const hl = createHandler({ ping: () => 'pong' }, (m) => lines.push(m));
  await hl(JSON.stringify(req('ping', { token: 'hunter2' })));
  await hl(JSON.stringify(req('nope')));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('nope');
  expect(lines[0]).toContain('METHOD_NOT_FOUND');
  expect(lines.join()).not.toContain('hunter2');
});

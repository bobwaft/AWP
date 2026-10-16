import { expect, test } from 'vitest';
import { methods, notifications, RpcRequest, RpcResponse } from './index';

test('request envelope accepts valid and rejects bad version', () => {
  expect(
    RpcRequest.safeParse({ jsonrpc: '2.0', id: 1, method: 'ping' }).success,
  ).toBe(true);
  expect(
    RpcRequest.safeParse({ jsonrpc: '1.0', id: 1, method: 'ping' }).success,
  ).toBe(false);
});

test('response carries a stable string error code', () => {
  const r = RpcResponse.parse({
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32601, message: 'x', data: { code: 'METHOD_NOT_FOUND' } },
  });
  expect(r.error?.data?.code).toBe('METHOD_NOT_FOUND');
});

test('method and notification schemas', () => {
  expect(methods.version.result.safeParse({ version: '1' }).success).toBe(true);
  expect(methods.ping.result.safeParse('nope').success).toBe(false);
  expect(notifications.toast.safeParse({ level: 'x', text: '' }).success).toBe(
    false,
  );
});

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

import { type FormField, validateValues } from './index';

const fields: FormField[] = [
  { id: 'name', label: 'Name', type: 'text', required: true, max: 5 },
  { id: 'n', label: 'N', type: 'number', min: 1, max: 3 },
  {
    id: 'pick',
    label: 'Pick',
    type: 'select',
    options: [{ value: 'a', label: 'A' }],
  },
  { id: 'url', label: 'URL', type: 'url' },
  {
    id: 'rows',
    label: 'Rows',
    type: 'list',
    fields: [{ id: 'c', label: 'C', type: 'text', required: true }],
  },
];

test('validateValues: required, ranges, options, urls, nested lists, and "not sure"', () => {
  expect(validateValues(fields, {})).toEqual({ name: 'Required' });
  expect(validateValues(fields, {}, ['name'])).toEqual({});
  expect(
    validateValues(fields, { name: 'toolong', n: 9, pick: 'z', url: 'nope' }),
  ).toEqual({
    name: 'At most 5 characters',
    n: 'At most 3',
    pick: 'Pick one of the options',
    url: 'Enter a full URL',
  });
  expect(
    validateValues(fields, { name: 'ok', rows: [{ c: 'x' }, {}] }),
  ).toEqual({ 'rows.1.c': 'Required' });
});

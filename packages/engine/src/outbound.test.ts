import { expect, test } from 'vitest';
import { createOutbound, getSecret } from './outbound';

test('secret.get resolves from a response line and ignores unrelated lines', async () => {
  const sent: string[] = [];
  const out = createOutbound((l) => sent.push(l));
  const p = getSecret(out, 'awp/figma/default');
  const req = JSON.parse(sent[0]);
  expect(req).toMatchObject({
    method: 'secret.get',
    params: { key: 'awp/figma/default' },
  });
  expect(out.handleLine('{"jsonrpc":"2.0","id":99,"result":{}}')).toBe(false);
  expect(out.handleLine('{"jsonrpc":"2.0","id":1,"method":"ping"}')).toBe(
    false,
  );
  expect(
    out.handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { value: 's3' } }),
    ),
  ).toBe(true);
  expect(await p).toBe('s3');
});

test('errors reject and timeouts reject', async () => {
  const sent: string[] = [];
  const out = createOutbound((l) => sent.push(l), 20);
  const p = out.call('secret.get', {});
  out.handleLine(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -1, message: 'nope' },
    }),
  );
  await expect(p).rejects.toThrow('nope');
  await expect(out.call('secret.get', {})).rejects.toThrow('timed out');
});

import { expect, test } from 'vitest';
import { redact } from './redact';

test('removes known secret values, including JSON-escaped and URL-encoded forms', () => {
  const secret = 'mongodb://user:p"ss@host/db';
  const out = redact(
    `failed with ${secret} and ${JSON.stringify(secret)} and ${encodeURIComponent(secret)}`,
    [secret],
  );
  expect(out).not.toContain('p"ss');
  expect(out).not.toContain('p\\"ss');
  expect(out).not.toContain(encodeURIComponent(secret));
  expect(out).toContain('[redacted]');
});

test('removes token-looking assignments even when the value is unknown', () => {
  const out = redact(
    'npm ERR! token=abcd1234efgh and API_KEY: sk-live-9999 and password = hunter2xx and authorization=Bearer abc.def.ghi',
  );
  for (const leak of [
    'abcd1234efgh',
    'sk-live-9999',
    'hunter2xx',
    'abc.def.ghi',
  ])
    expect(out).not.toContain(leak);
  expect(out).toContain('token=[redacted]');
});

test('leaves ordinary text alone and ignores very short secrets', () => {
  expect(redact('uv is not installed', ['x'])).toBe('uv is not installed');
  expect(redact('exit 1 in step key-rotation', [])).toBe(
    'exit 1 in step key-rotation',
  );
});

test('removes credentials embedded in a URL or connection string', () => {
  const out = redact(
    'connect failed: mongodb://user:hunter2secret@cluster.example.net/db and https://bob:pw123456@host/x',
  );
  expect(out).not.toContain('hunter2secret');
  expect(out).not.toContain('pw123456');
  expect(out).toContain('mongodb://user:[redacted]@cluster.example.net/db');
  // a plain URL without credentials is untouched
  expect(redact('see https://github.com/a/b')).toBe(
    'see https://github.com/a/b',
  );
});

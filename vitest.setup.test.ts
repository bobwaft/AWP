import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('tests never fall back to the repo data dir (BUG-002)', () => {
  const dir = process.env.AWP_DATA_DIR;
  expect(dir).toBeTruthy();
  expect(resolve(dir as string)).not.toBe(resolve(process.cwd(), 'data'));
});

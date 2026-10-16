import { expect, test } from 'vitest';
import { name } from './index';

test('exports name', () => {
  expect(name).toBe('@awp/prompts');
});

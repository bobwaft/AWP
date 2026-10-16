// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const call = vi.fn();
vi.mock('../lib/engine', () => ({ engine: { call, on: () => () => {} } }));
const { SettingsScreen } = await import('./SettingsScreen');

afterEach(cleanup);
const s = { theme: 'system', display: '3d' } as const;

test('About shows the engine version from the engine', async () => {
  call.mockResolvedValue({ version: '4.5.6' });
  render(<SettingsScreen settings={s} onChange={() => {}} />);
  expect(await screen.findByText('4.5.6')).toBeTruthy();
});

test('About degrades when the engine is unreachable', async () => {
  call.mockRejectedValue(new Error('x'));
  render(<SettingsScreen settings={s} onChange={() => {}} />);
  expect(await screen.findByText('unavailable')).toBeTruthy();
});

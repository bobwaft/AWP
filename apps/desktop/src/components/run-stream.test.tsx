// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AgentRunStream } from './AgentRunStream';

afterEach(cleanup);

test('renders events, model badge, usage; Stop calls back and disables when idle', () => {
  const onStop = vi.fn();
  const events = [
    { type: 'command', cmd: 'ls' },
    { type: 'file_change', path: 'a.txt', kind: 'add' },
    { type: 'message', role: 'assistant', text: 'hello' },
    { type: 'usage', inputTokens: 5, outputTokens: 7, costUsd: 0.01 },
  ] as const;
  const { rerender } = render(
    <AgentRunStream
      events={[...events]}
      running
      model="haiku"
      onStop={onStop}
    />,
  );
  expect(screen.getByText('haiku')).toBeTruthy();
  expect(screen.getByText('$ ls')).toBeTruthy();
  expect(screen.getByText('hello')).toBeTruthy();
  expect(screen.getByText(/5 in · 7 out/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(onStop).toHaveBeenCalled();
  rerender(
    <AgentRunStream events={[...events]} running={false} onStop={onStop} />,
  );
  expect(
    (screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

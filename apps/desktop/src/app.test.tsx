// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const status = {
  setup: 'complete',
  ideation: 'complete',
  design: 'stale',
  planning: 'active',
  connectors: 'locked',
  implementation: 'locked',
  testing: 'locked',
  security: 'locked',
  polishing: 'locked',
  shipping: 'locked',
} as const;
const state = {
  schemaVersion: 1,
  project: { name: 'Demo', mode: 'greenfield', path: '/p' },
  current: 'planning',
  stages: Object.fromEntries(
    Object.entries(status).map(([k, v]) => [
      k,
      { status: v, criticRounds: 0, override: null },
    ]),
  ),
  execution: { mode: 'phased' },
  phases: [],
  updatedAt: '2026-01-01T00:00:00Z',
};
vi.mock('./lib/engine', () => ({
  engine: {
    on: () => () => {},
    call: async (m: string) => {
      if (m === 'project.list')
        return [
          {
            path: '/p',
            name: 'Demo',
            stage: 'planning',
            phasesPassed: 0,
            phasesTotal: 0,
            openBugs: 0,
            missing: false,
          },
        ];
      if (m === 'project.open' || m === 'stage.enter') return state;
      throw new Error(`unexpected ${m}`);
    },
  },
}));
const { App } = await import('./App');

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const loaded = () =>
  waitFor(() => expect(current()).toBe('Stage 4, Planning, current'));
const current = () =>
  screen
    .getByRole('navigation', { name: 'Stages' })
    .querySelector('[aria-current=page]')
    ?.getAttribute('aria-label');

test('stage rail switches by click and by keys 1-0', async () => {
  render(<App />);
  await loaded();
  expect(current()).toBe('Stage 4, Planning, current');
  fireEvent.click(screen.getAllByRole('button', { name: /^Stage 2,/ })[0]);
  expect(current()).toBe('Stage 2, Ideation, done');
  fireEvent.keyDown(window, { key: '0' });
  expect(current()).toBe('Stage 10, Shipping, locked');
  fireEvent.keyDown(window, { key: '3' });
  expect(current()).toBe('Stage 3, Design, stale');
});

test('rifle hotspots: 10 labelled, clickable and keyboard-operable', async () => {
  render(<App />);
  await loaded();
  fireEvent.keyDown(window, { key: '5' }); // Connectors is still a placeholder screen
  const diagram = screen.getByRole('group', { name: 'Rifle diagram' });
  const spots = diagram.querySelectorAll('[role=button]');
  expect(spots).toHaveLength(10);
  fireEvent.click(spots[5]);
  expect(current()).toBe('Stage 6, Implementation, locked');
  fireEvent.keyDown(spots[0], { key: 'Enter' });
  expect(current()).toBe('Stage 1, Setup, done');
});

test('command palette opens with Ctrl+K, filters, and jumps', async () => {
  render(<App />);
  await loaded();
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const input = screen.getByLabelText('Search commands');
  fireEvent.change(input, { target: { value: 'security' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(current()).toBe('Stage 8, Security, locked');
});

test('typing a digit in the palette does not change stage', async () => {
  render(<App />);
  await loaded();
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.keyDown(screen.getByLabelText('Search commands'), { key: '2' });
  expect(current()).toBe('Stage 4, Planning, current');
});

test('theme and display settings persist and set data-theme', async () => {
  render(<App />);
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByLabelText('Light'));
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByLabelText('2D mode'));
  expect(JSON.parse(localStorage.getItem('awp.settings') ?? '{}')).toEqual({
    theme: 'light',
    display: '2d',
  });
});

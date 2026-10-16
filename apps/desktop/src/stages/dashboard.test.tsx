// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const call = vi.fn();
vi.mock('../lib/engine', () => ({ engine: { call, on: () => () => {} } }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: async () => '/home/me/code',
}));
const { Dashboard } = await import('./Dashboard');
const { ProjectProvider } = await import('../lib/project');
const { ToastProvider } = await import('../components/Toast');

afterEach(() => {
  cleanup();
  call.mockReset();
});

const summary = (o: object) => ({
  path: '/a',
  name: 'alpha',
  stage: 'design',
  phasesPassed: 1,
  phasesTotal: 4,
  lastActivity: '2026-01-02T00:00:00Z',
  openBugs: 2,
  missing: false,
  ...o,
});
const mount = () =>
  render(
    <ToastProvider>
      <ProjectProvider>
        <Dashboard onRerunSetup={() => {}} />
      </ProjectProvider>
    </ToastProvider>,
  );

test('recent projects show stage, phase progress and open bugs; missing ones are disabled', async () => {
  call.mockImplementation(async (m: string) =>
    m === 'project.list'
      ? [summary({}), summary({ path: '/b', name: 'beta', missing: true })]
      : new Error('x'),
  );
  call.mockImplementationOnce(async () => [
    summary({}),
    summary({ path: '/b', name: 'beta', missing: true }),
  ]);
  mount();
  expect(await screen.findByText(/Phases 1\/4/)).toBeTruthy();
  expect(screen.getByText(/2 open bugs/)).toBeTruthy();
  expect(screen.getByText('Folder missing')).toBeTruthy();
  const opens = screen.getAllByRole('button', {
    name: 'Open',
  }) as HTMLButtonElement[];
  expect(opens.map((b) => b.disabled)).toEqual([false, true]);
});

test('creating a project joins parent and name and calls project.create', async () => {
  call.mockImplementation(async (m: string) =>
    m === 'project.list'
      ? []
      : { project: { name: 'x', path: '/p' }, current: 'ideation', stages: {} },
  );
  mount();
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'acme' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Choose…' }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText('Parent folder') as HTMLInputElement).value,
    ).toBe('/home/me/code'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('project.create', {
      path: '/home/me/code/acme',
      name: 'acme',
    }),
  );
});

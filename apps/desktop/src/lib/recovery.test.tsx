// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

type Handler = (e: { method: string; params: unknown }) => void;
const call = vi.fn();
const handlers = new Set<Handler>();
vi.mock('./engine', () => ({
  engine: {
    call,
    on: (h: Handler) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => [] }));
vi.mock('../components/TerminalDrawer', () => ({
  TerminalPanel: () => <div>terminal</div>,
}));
const emit = (method: string, params: unknown = {}) =>
  act(() => {
    for (const h of handlers) h({ method, params });
  });

const { useRun } = await import('./run');
const { ProjectProvider, useProject } = await import('./project');
const { SetupView } = await import('../stages/SetupView');
const { TerminalProvider } = await import('./terminal');

afterEach(() => {
  cleanup();
  call.mockReset();
  handlers.clear();
});

test('Stop pressed before agent.run resolves is applied once the runId arrives (BUG-006)', async () => {
  let resolveRun: (v: { runId: string }) => void = () => {};
  call.mockImplementation((m: string) =>
    m === 'agent.run'
      ? new Promise((r) => {
          resolveRun = r;
        })
      : Promise.resolve({}),
  );
  const { result } = renderHook(() => useRun());
  let started!: Promise<void>;
  act(() => {
    started = result.current.start({ prompt: 'x', cwd: '/p', adapter: 'fake' });
  });
  await act(() => result.current.stop());
  expect(call).not.toHaveBeenCalledWith('agent.stop', expect.anything());
  await act(async () => {
    resolveRun({ runId: 'r1' });
    await started;
  });
  expect(call).toHaveBeenCalledWith('agent.stop', { runId: 'r1' });
});

const summary = {
  path: '/a',
  name: 'alpha',
  stage: 'ideation',
  phasesPassed: 0,
  phasesTotal: 0,
  openBugs: 0,
  missing: false,
};
const state = { project: { path: '/a' }, current: 'ideation', stages: {} };

function Probe() {
  const { project, recents } = useProject();
  return (
    <p>
      {project?.project.path ?? 'none'}|{recents.length}
    </p>
  );
}

test('engine.restarted re-lists projects and reopens the open one (BUG-004)', async () => {
  let lists = 0;
  call.mockImplementation(async (m: string) => {
    if (m === 'project.list') {
      lists++;
      return [summary];
    }
    return state;
  });
  render(
    <ProjectProvider>
      <Probe />
    </ProjectProvider>,
  );
  await screen.findByText('/a|1');
  call.mockClear();
  await emit('engine.restarted');
  await waitFor(() => {
    expect(call).toHaveBeenCalledWith('project.list');
    expect(call).toHaveBeenCalledWith('project.open', { path: '/a' });
  });
  expect(lists).toBeGreaterThan(1);
});

test('Setup shows the error with Retry, and re-detects after engine.restarted', async () => {
  const ok = { state: 'ready', version: '1.0.0' };
  let fail = true;
  call.mockImplementation(async (m: string) => {
    if (m !== 'setup.detect') return {};
    if (fail) throw new Error('INVALID_PARAMS boom');
    return { git: ok, claude: ok, gh: ok, semgrep: ok };
  });
  render(
    <TerminalProvider>
      <SetupView onContinue={() => {}} />
    </TerminalProvider>,
  );
  expect(await screen.findByText(/INVALID_PARAMS boom/)).toBeTruthy();
  fail = false;
  await emit('engine.restarted');
  await waitFor(() =>
    expect(screen.queryByText(/INVALID_PARAMS boom/)).toBeNull(),
  );
  expect(await screen.findAllByText('Ready')).toBeTruthy();
});

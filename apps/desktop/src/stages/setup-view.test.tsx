// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const call = vi.fn();
const invoke = vi.fn();
const listeners = new Map<string, (e: { payload: unknown }) => void>();
vi.mock('../lib/engine', () => ({ engine: { call, on: () => () => {} } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, cb: (e: { payload: unknown }) => void) => {
    listeners.set(name, cb);
    return () => {};
  },
}));
vi.mock('../components/TerminalDrawer', () => ({
  TerminalPanel: () => <div>terminal</div>,
}));

const { SetupView } = await import('./SetupView');
const { TerminalProvider } = await import('../lib/terminal');

const ready = { state: 'ready', version: '1.0.0' } as const;
const detect = (claude: object, git: object = ready) => ({
  claude,
  git,
  gh: { state: 'missing' },
  semgrep: { state: 'missing' },
});

beforeEach(() => {
  vi.resetAllMocks();
  listeners.clear();
  invoke.mockImplementation(async (cmd: string) =>
    cmd === 'pty_spawn' ? 'pty1' : [],
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = (onContinue = () => {}) =>
  render(
    <TerminalProvider>
      <SetupView onContinue={onContinue} />
    </TerminalProvider>,
  );

test('Continue is blocked until git and signed-in Claude are ready', async () => {
  call.mockImplementation(async (m: string) =>
    m === 'setup.detect'
      ? detect({ state: 'needs_signin', version: '2.1.301' })
      : {},
  );
  mount();
  expect(await screen.findByText('Needs sign-in')).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: 'Continue to Ideation',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test('ready shows account and plan and enables Continue', async () => {
  const onContinue = vi.fn();
  call.mockResolvedValue(
    detect({
      state: 'ready',
      version: '2.1.301',
      account: 'me@x.io',
      plan: 'pro',
    }),
  );
  mount(onContinue);
  expect(await screen.findByText(/me@x\.io/)).toBeTruthy();
  const btn = screen.getByRole('button', {
    name: 'Continue to Ideation',
  }) as HTMLButtonElement;
  expect(btn.disabled).toBe(false);
  fireEvent.click(btn);
  expect(onContinue).toHaveBeenCalled();
});

test('Fix in terminal pre-types the command without Enter, polls, and flips to ready', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let signedIn = false;
  call.mockImplementation(async (m: string) =>
    m === 'setup.detect'
      ? detect(
          signedIn
            ? { state: 'ready', version: '2.1.301', account: 'a@b.c' }
            : { state: 'needs_signin', version: '2.1.301' },
        )
      : {},
  );
  mount();
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'Fix in terminal' }))[0],
  );
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('pty_write', {
      ptyId: 'pty1',
      data: 'claude',
    }),
  );
  const writes = invoke.mock.calls
    .filter((c) => c[0] === 'pty_write')
    .map((c) => c[1].data as string);
  expect(writes.every((w) => !/[\r\n]/.test(w))).toBe(true);
  expect(await screen.findByText('Waiting for the terminal…')).toBeTruthy();
  signedIn = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3100);
  });
  expect(await screen.findByText(/a@b\.c/)).toBeTruthy();
});

test('non-zero exit of a fix shows the failure hint', async () => {
  call.mockImplementation(async (m: string) =>
    m === 'setup.detect' ? detect({ state: 'missing' }) : {},
  );
  mount();
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'Fix in terminal' }))[0],
  );
  await vi.waitFor(() => expect(listeners.has('pty://exit/pty1')).toBe(true));
  await act(async () => listeners.get('pty://exit/pty1')?.({ payload: 1 }));
  expect(await screen.findByText(/didn't finish/)).toBeTruthy();
});

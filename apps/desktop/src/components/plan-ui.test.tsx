// @vitest-environment jsdom
import type { Phase, StackOption } from '@awp/protocol';
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
vi.mock('./MarkdownEditor', () => ({
  MarkdownEditor: () => <div>text editor</div>,
}));
const { StackOptions } = await import('./StackOptions');
const { PhaseBarrel } = await import('./PhaseBarrel');

afterEach(() => {
  cleanup();
  call.mockReset();
});

const verify = {
  install: 'bun install',
  typecheck: 'bun run typecheck',
  lint: 'bun run lint',
  test: 'bun run test',
  build: 'bun run build',
};
const opt = (id: string): StackOption => ({
  id,
  name: id.toUpperCase(),
  summary: 's',
  stack: ['Language: TS'],
  pros: ['fast'],
  cons: ['young'],
  fit: 'fits',
  verify,
});
const phase = (n: number, o: Partial<Phase> = {}): Phase => ({
  n,
  title: `P${n}`,
  goal: 'g',
  tasks: ['a', 'b'],
  files: [],
  acceptance: ['x'],
  checklist: ['y'],
  ui: n === 2,
  ...o,
});

test('stack options compare side by side; verify commands are editable and only edits are sent', async () => {
  call.mockResolvedValue('ok');
  render(
    <StackOptions
      options={[opt('a'), opt('b')]}
      busy={false}
      onError={() => {}}
    />,
  );
  expect(screen.getAllByText('Why it fits:', { exact: false })).toHaveLength(2);
  const card = screen.getByLabelText('Stack B');
  const test_ = card.querySelector('input[id$="test"]') as HTMLInputElement;
  fireEvent.change(test_, { target: { value: 'vitest run' } });
  fireEvent.click(card.querySelector('button') as HTMLButtonElement);
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('plan.pickStack', {
      optionId: 'b',
      edits: { verify: { test: 'vitest run' }, notes: undefined },
    }),
  );
});

test('an emptied verify command disables picking', () => {
  render(
    <StackOptions
      options={[opt('a'), opt('b')]}
      busy={false}
      onError={() => {}}
    />,
  );
  const card = screen.getByLabelText('Stack A');
  fireEvent.change(
    card.querySelector('input[id$="lint"]') as HTMLInputElement,
    { target: { value: ' ' } },
  );
  expect(
    (
      screen.getAllByRole('button', {
        name: 'Use this stack',
      })[0] as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test('phase barrel: shows phases and errors; move, split and merge save the transformed plan', async () => {
  const phases = [phase(1), phase(2), phase(3)];
  call.mockImplementation(async (m: string) =>
    m === 'plan.phases'
      ? { phases, errors: ['Phase 3: needs a goal'], text: '# Phases' }
      : { errors: [] },
  );
  render(<PhaseBarrel refreshKey="k" />);
  expect(await screen.findByText('P2')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain(
    'Phase 3: needs a goal',
  );
  expect(screen.getByText('UI')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Move phase 3 up' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('plan.savePhases', {
      phases: [
        expect.objectContaining({ n: 1, title: 'P1' }),
        expect.objectContaining({ n: 2, title: 'P3' }),
        expect.objectContaining({ n: 3, title: 'P2' }),
      ],
    }),
  );

  call.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Split phase 1' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'plan.savePhases',
      expect.objectContaining({
        phases: expect.arrayContaining([
          expect.objectContaining({ title: 'P1 (part 1)', tasks: ['a'] }),
        ]),
      }),
    ),
  );

  call.mockClear();
  fireEvent.click(
    screen.getByRole('button', { name: 'Merge phase 1 with next' }),
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'plan.savePhases',
      expect.objectContaining({
        phases: [
          expect.objectContaining({ title: 'P1 + P2', ui: true }),
          expect.objectContaining({ n: 2, title: 'P3' }),
        ],
      }),
    ),
  );
});

test('phase details expand and the raw editor toggles', async () => {
  call.mockResolvedValue({ phases: [phase(1)], errors: [], text: '# Phases' });
  render(<PhaseBarrel refreshKey="k" />);
  fireEvent.click(await screen.findByText('P1'));
  expect(screen.getByText('ACCEPTANCE')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit as text' }));
  expect(screen.getByText('text editor')).toBeTruthy();
});

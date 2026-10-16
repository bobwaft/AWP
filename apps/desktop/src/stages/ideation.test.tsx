// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

let snap: any;
const call = vi.fn();
vi.mock('../lib/engine', () => ({ engine: { call, on: () => () => {} } }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: async () => null }));
vi.mock('../components/MarkdownEditor', () => ({
  MarkdownEditor: () => <div>editor</div>,
}));
const { IdeationView } = await import('./IdeationView');
const { ToastProvider } = await import('../components/Toast');

const base = (o: object) => ({
  stage: 'ideation',
  specFile: 'docs/PRD.md',
  busy: null,
  chat: [],
  critique: null,
  rounds: 0,
  readiness: null,
  blocking: 0,
  pending: { question: null, form: null, permission: null },
  unsure: [],
  declined: [],
  ...o,
});
const critique = (n: number) => ({
  round: 1,
  readiness: {},
  questions: Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    text: `Question ${i}`,
    blocking: true,
  })),
});

afterEach(() => {
  cleanup();
  call.mockReset();
});

const mount = (s: object) => {
  snap = base(s);
  call.mockImplementation(async (m: string) =>
    m === 'spec.get'
      ? snap
      : m === 'spec.read'
        ? { content: '# PRD', base: null }
        : 'ok',
  );
  return render(
    <ToastProvider>
      <IdeationView />
    </ToastProvider>,
  );
};
const completeBtn = () =>
  screen.getByRole('button', { name: 'Complete stage' }) as HTMLButtonElement;

test('Complete stage is disabled before any review and while blocking questions exist', async () => {
  mount({});
  await screen.findByText('Not reviewed yet');
  expect(completeBtn().disabled).toBe(true);
  cleanup();
  mount({ rounds: 1, blocking: 2, critique: critique(2) });
  await screen.findByText(/2 blocking · review 1\/3/);
  expect(completeBtn().disabled).toBe(true);
  expect(screen.queryByRole('button', { name: /Complete anyway/ })).toBeNull();
  expect(screen.getByText('Question 1')).toBeTruthy();
});

test('Complete stage enables at zero blocking and calls stage.complete', async () => {
  mount({ rounds: 2, blocking: 0, critique: critique(0), readiness: 90 });
  await waitFor(() => expect(completeBtn().disabled).toBe(false));
  fireEvent.click(completeBtn());
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('stage.complete', {
      stage: 'ideation',
      overrideReason: undefined,
    }),
  );
});

test('after 3 rounds with blockers, "Complete anyway" needs a reason', async () => {
  mount({ rounds: 3, blocking: 1, critique: critique(1) });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Complete anyway…' }),
  );
  const confirm = screen.getByRole('button', {
    name: 'Complete anyway',
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/Why are these fine/), {
    target: { value: 'Decide later' },
  });
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('stage.complete', {
      stage: 'ideation',
      overrideReason: 'Decide later',
    }),
  );
});

test('a pending question shows choice chips; clicking one answers it', async () => {
  mount({
    pending: {
      question: {
        questionId: 'q1',
        text: 'Who is it for?',
        choices: ['devs', 'ops'],
      },
      form: null,
      permission: null,
    },
  });
  fireEvent.click(await screen.findByText('devs'));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('question.answer', {
      questionId: 'q1',
      answer: 'devs',
    }),
  );
});

test('busy disables the composer; chat messages render; sending calls chat.send', async () => {
  mount({
    busy: 'interviewer',
    chat: [{ id: '1', role: 'assistant', text: 'Hello there', ts: '' }],
  });
  expect(await screen.findByText('Hello there')).toBeTruthy();
  expect(
    (screen.getByLabelText('Message') as HTMLTextAreaElement).disabled,
  ).toBe(true);
  cleanup();
  mount({});
  fireEvent.change(await screen.findByLabelText('Message'), {
    target: { value: 'A todo app' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('chat.send', {
      stage: 'ideation',
      text: 'A todo app',
      attachments: [],
    }),
  );
});

test('a pending form replaces the composer; "Answer in chat instead" declines and restores it', async () => {
  const form = {
    formId: 'f1',
    title: 'Feature spec',
    fields: [{ id: 'name', label: 'Name', type: 'text', required: true }],
    aiFilled: [],
    orphaned: false,
  };
  mount({ pending: { question: null, form, permission: null } });
  expect(
    await screen.findByRole('form', { name: 'Feature spec' }),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Message')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Answer in chat instead' }),
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('form.decline', { formId: 'f1' }),
  );
  expect(await screen.findByLabelText('Message')).toBeTruthy();
});

test('a permission request shows Allow/Deny', async () => {
  mount({
    pending: {
      question: null,
      form: null,
      permission: { requestId: 'p1', tool: 'Bash', input: { command: 'ls' } },
    },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('permission.decide', {
      requestId: 'p1',
      allow: false,
    }),
  );
});

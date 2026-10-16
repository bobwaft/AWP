// @vitest-environment jsdom

import type { FormField } from '@awp/protocol';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { FormCard } from './FormCard';

afterEach(cleanup);

const fields: FormField[] = [
  { id: 'name', label: 'Name', type: 'text', required: true },
  {
    id: 'priority',
    label: 'Priority',
    type: 'select',
    required: true,
    options: [{ value: 'must', label: 'Must' }],
  },
  {
    id: 'criteria',
    label: 'Criteria',
    type: 'list',
    required: true,
    fields: [{ id: 'c', label: 'Criterion', type: 'text' }],
  },
] as const;
const form = {
  title: 'Feature spec',
  fields: [...fields],
  prefill: { name: 'Walks' },
  aiFilled: ['name'],
  orphaned: false,
};

test('AI-filled values are marked until touched', () => {
  render(<FormCard form={form} onSubmit={() => {}} />);
  expect(screen.getByText('from your earlier answer')).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/^Name/), {
    target: { value: 'Walks daily' },
  });
  expect(screen.queryByText('from your earlier answer')).toBeNull();
});

test('submit shows inline errors and focuses the first invalid field; nothing is sent', () => {
  const onSubmit = vi.fn();
  render(<FormCard form={{ ...form, prefill: {} }} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getAllByRole('alert').length).toBe(3);
  expect(document.activeElement?.id).toBe('ff-name');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('"Not sure, help me" satisfies required and is reported; Ctrl+Enter submits', async () => {
  const onSubmit = vi.fn();
  render(<FormCard form={form} onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText(/^Priority/), {
    target: { value: 'must' },
  });
  const sure = screen.getAllByLabelText('Not sure, help me');
  fireEvent.click(sure[2]); // criteria
  fireEvent.keyDown(screen.getByRole('form'), { key: 'Enter', ctrlKey: true });
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0][1]).toEqual(['criteria']);
});

test('list rows can be added and filled; ask and decline callbacks fire', async () => {
  const onSubmit = vi.fn();
  const onAsk = vi.fn();
  const onDecline = vi.fn();
  render(
    <FormCard
      form={form}
      onSubmit={onSubmit}
      onAsk={onAsk}
      onDecline={onDecline}
    />,
  );
  fireEvent.change(screen.getByLabelText(/^Priority/), {
    target: { value: 'must' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add criteria' }));
  fireEvent.change(screen.getByLabelText('Criterion 1'), {
    target: { value: 'Logs distance' },
  });
  fireEvent.change(screen.getByLabelText('Ask about this form'), {
    target: { value: 'What is must?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(onAsk).toHaveBeenCalledWith(
    'What is must?',
    expect.objectContaining({ name: 'Walks' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Answer in chat instead' }),
  );
  expect(onDecline).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0][0].criteria).toEqual([{ c: 'Logs distance' }]);
});

test('drafts are saved after typing stops', async () => {
  vi.useFakeTimers();
  const onDraft = vi.fn();
  render(<FormCard form={form} onSubmit={() => {}} onDraft={onDraft} />);
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'X' } });
  vi.advanceTimersByTime(700);
  expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ name: 'X' }));
  vi.useRealTimers();
});

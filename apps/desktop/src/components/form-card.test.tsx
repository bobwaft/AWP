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

const chip = (n: number) =>
  screen.getByRole('button', { name: new RegExp(`^${n}. `) });
const next = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

test('submit shows inline errors, jumps to the first failing step and focuses it; nothing is sent', () => {
  const onSubmit = vi.fn();
  render(<FormCard form={{ ...form, prefill: {} }} onSubmit={onSubmit} />);
  fireEvent.keyDown(screen.getByRole('form'), { key: 'Enter', ctrlKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(chip(1).getAttribute('aria-current')).toBe('step');
  expect(screen.getAllByRole('alert').length).toBe(1);
  expect(document.activeElement?.id).toBe('ff-name');
  // errors on later steps are flagged on their chips
  expect(chip(2).getAttribute('aria-label')).toContain('has an error');
  expect(chip(3).getAttribute('aria-label')).toContain('has an error');
});

test('a validation error on a later step jumps there', () => {
  const onSubmit = vi.fn();
  render(<FormCard form={form} onSubmit={onSubmit} />); // name prefilled
  fireEvent.keyDown(screen.getByRole('form'), { key: 'Enter', ctrlKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(chip(2).getAttribute('aria-current')).toBe('step');
  expect(document.activeElement?.id).toBe('ff-priority');
});

test('chip strip shows empty, filled, not-sure states as text; chips jump to steps', () => {
  render(<FormCard form={form} onSubmit={() => {}} />);
  expect(chip(1).getAttribute('aria-label')).toBe('1. Name, filled');
  expect(chip(2).getAttribute('aria-label')).toBe('2. Priority, empty');
  expect(chip(1).getAttribute('aria-current')).toBe('step');
  fireEvent.click(chip(2));
  expect(chip(2).getAttribute('aria-current')).toBe('step');
  expect(chip(1).getAttribute('aria-current')).toBeNull();
  fireEvent.click(screen.getByLabelText('Not sure, help me'));
  expect(chip(2).getAttribute('aria-label')).toBe('2. Priority, not sure');
  expect(chip(2).textContent).toContain('?');
});

test('one field per step; Back/Next move; Submit only on the last step', () => {
  render(<FormCard form={form} onSubmit={() => {}} />);
  expect(screen.getByLabelText(/^Name/)).toBeTruthy();
  expect(screen.queryByLabelText(/^Priority/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  next();
  expect(screen.getByLabelText(/^Priority/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText(/^Name/)).toBeTruthy();
  next();
  next();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
});

test('"Answer in chat instead" and "Ask about this form" are visible on every step', () => {
  render(
    <FormCard
      form={form}
      onSubmit={() => {}}
      onAsk={() => {}}
      onDecline={() => {}}
    />,
  );
  for (const n of [1, 2, 3]) {
    fireEvent.click(chip(n));
    expect(
      screen.getByRole('button', { name: 'Answer in chat instead' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Ask about this form')).toBeTruthy();
  }
});

test('"Not sure, help me" satisfies required and is reported; Ctrl+Enter submits from step 1', async () => {
  const onSubmit = vi.fn();
  render(<FormCard form={form} onSubmit={onSubmit} />);
  fireEvent.click(chip(2));
  fireEvent.change(screen.getByLabelText(/^Priority/), {
    target: { value: 'must' },
  });
  fireEvent.click(chip(3));
  fireEvent.click(screen.getByLabelText('Not sure, help me')); // criteria
  fireEvent.click(chip(1));
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
  next();
  fireEvent.change(screen.getByLabelText(/^Priority/), {
    target: { value: 'must' },
  });
  next();
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

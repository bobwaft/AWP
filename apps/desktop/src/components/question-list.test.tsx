// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { QuestionList } from './QuestionList';

afterEach(cleanup);

test('many questions sit in a bounded section with a scrolling list (BUG-014)', () => {
  const questions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    text: `Question ${i}`,
    blocking: i % 2 === 0,
  }));
  render(<QuestionList critique={{ questions } as never} onPick={() => {}} />);
  const section = screen.getByLabelText('Open questions');
  expect(section.className).toContain('shrink-0');
  expect(section.className).toContain('max-h-');
  expect(section.querySelector('ul')?.className).toContain('overflow-auto');
  expect(screen.getByText('Question 29')).toBeTruthy();
});

test('the blocking/optional label never wraps (BUG-016)', () => {
  render(
    <QuestionList
      critique={
        { questions: [{ id: 'a', text: 'Why?', blocking: false }] } as never
      }
      onPick={() => {}}
    />,
  );
  const label = screen.getByText('○ optional');
  expect(label.className).toContain('shrink-0');
  expect(label.className).toContain('whitespace-nowrap');
});

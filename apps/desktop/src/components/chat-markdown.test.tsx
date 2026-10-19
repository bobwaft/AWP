// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ChatMarkdown } from './ChatMarkdown';

afterEach(cleanup);

test('renders bold and lists as elements', () => {
  const { container } = render(
    <ChatMarkdown text={'**bold** text\n\n- one\n- two'} />,
  );
  expect(container.querySelector('strong')?.textContent).toBe('bold');
  expect(container.querySelectorAll('li').length).toBe(2);
});

test('raw HTML is not rendered', () => {
  const { container } = render(
    <ChatMarkdown text={'<img src=x onerror=alert(1)> hi'} />,
  );
  expect(container.querySelector('img')).toBeNull();
});

test('links are inert: no href, target shown as a tooltip, click is not a navigation', () => {
  const { container } = render(
    <ChatMarkdown text="[docs](https://example.com/x)" />,
  );
  expect(container.querySelector('a')).toBeNull();
  const link = screen.getByText('docs');
  expect(link.getAttribute('title')).toBe('https://example.com/x');
  expect(link.getAttribute('href')).toBeNull();
  // fireEvent returns false when the default action was not prevented
  expect(fireEvent.click(link)).toBe(true);
});

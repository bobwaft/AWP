// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const current = () =>
  screen
    .getByRole('navigation', { name: 'Stages' })
    .querySelector('[aria-current=page]')
    ?.getAttribute('aria-label');

test('stage rail switches by click and by keys 1-0', () => {
  render(<App />);
  expect(current()).toBe('Stage 4, Planning, current');
  fireEvent.click(screen.getAllByRole('button', { name: /^Stage 2,/ })[0]);
  expect(current()).toBe('Stage 2, Ideation, done');
  fireEvent.keyDown(window, { key: '0' });
  expect(current()).toBe('Stage 10, Shipping, locked');
  fireEvent.keyDown(window, { key: '3' });
  expect(current()).toBe('Stage 3, Design, stale');
});

test('rifle hotspots: 10 labelled, clickable and keyboard-operable', () => {
  render(<App />);
  const diagram = screen.getByRole('group', { name: 'Rifle diagram' });
  const spots = diagram.querySelectorAll('[role=button]');
  expect(spots).toHaveLength(10);
  fireEvent.click(spots[5]);
  expect(current()).toBe('Stage 6, Implementation, locked');
  fireEvent.keyDown(spots[0], { key: 'Enter' });
  expect(current()).toBe('Stage 1, Setup, done');
});

test('command palette opens with Ctrl+K, filters, and jumps', () => {
  render(<App />);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const input = screen.getByLabelText('Search commands');
  fireEvent.change(input, { target: { value: 'security' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(current()).toBe('Stage 8, Security, locked');
});

test('typing a digit in the palette does not change stage', () => {
  render(<App />);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.keyDown(screen.getByLabelText('Search commands'), { key: '2' });
  expect(current()).toBe('Stage 4, Planning, current');
});

test('theme and display settings persist and set data-theme', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByLabelText('Light'));
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByLabelText('2D mode'));
  expect(JSON.parse(localStorage.getItem('awp.settings') ?? '{}')).toEqual({
    theme: 'light',
    display: '2d',
  });
});

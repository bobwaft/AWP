// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import { stageForKey } from './stages';
import { applyTheme } from './theme';

beforeEach(() => localStorage.clear());

test('settings default, round-trip, and ignore garbage', () => {
  expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  saveSettings({ theme: 'light', display: '2d' });
  expect(loadSettings()).toEqual({ theme: 'light', display: '2d' });
  localStorage.setItem('awp.settings', '{"theme":"neon","display":7}');
  expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  localStorage.setItem('awp.settings', 'not json');
  expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
});

test('stage keys 1-9 map to stages, 0 to stage 10', () => {
  expect(stageForKey('1')).toBe(1);
  expect(stageForKey('9')).toBe(9);
  expect(stageForKey('0')).toBe(10);
  expect(stageForKey('a')).toBeUndefined();
});

test('applyTheme sets data-theme; system follows the OS', () => {
  applyTheme('light');
  expect(document.documentElement.dataset.theme).toBe('light');
  const listeners: (() => void)[] = [];
  let light = false;
  window.matchMedia = (() => ({
    get matches() {
      return light;
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  applyTheme('system');
  expect(document.documentElement.dataset.theme).toBe('dark');
  light = true;
  for (const fn of listeners) fn();
  expect(document.documentElement.dataset.theme).toBe('light');
});

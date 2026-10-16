import type { ThemePref } from './settings';

const query = () => window.matchMedia('(prefers-color-scheme: light)');

export const resolveTheme = (pref: ThemePref): 'dark' | 'light' =>
  pref === 'system' ? (query().matches ? 'light' : 'dark') : pref;

/** Sets data-theme on <html>; for System it follows the OS live. Returns a cleanup. */
export function applyTheme(pref: ThemePref): () => void {
  const set = () =>
    document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  set();
  if (pref !== 'system') return () => {};
  const mq = query();
  mq.addEventListener('change', set);
  return () => mq.removeEventListener('change', set);
}

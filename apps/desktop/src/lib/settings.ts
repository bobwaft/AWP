export type ThemePref = 'system' | 'dark' | 'light';
export type DisplayMode = '3d' | '2d' | 'reduced';
export type Settings = { theme: ThemePref; display: DisplayMode };

export const DEFAULT_SETTINGS: Settings = { theme: 'system', display: '3d' };

// shortcut: localStorage stands in for the app-data settings.json (ARCHITECTURE.md); move to the Tauri fs when the engine owns app files (Phase 2+).
const KEY = 'awp.settings';

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      theme: ['system', 'dark', 'light'].includes(raw.theme)
        ? raw.theme
        : DEFAULT_SETTINGS.theme,
      display: ['3d', '2d', 'reduced'].includes(raw.display)
        ? raw.display
        : DEFAULT_SETTINGS.display,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings last for this session only
  }
}

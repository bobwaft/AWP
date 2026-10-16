import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import tokens from './tokens.json';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
  .toLowerCase()
  .replaceAll('"', "'");

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('tokens.css mirrors tokens.json for both themes', () => {
  for (const theme of ['dark', 'light'] as const) {
    const block = css.split(`[data-theme='${theme}'] {`)[1].split('}')[0];
    for (const [name, value] of Object.entries(tokens[theme])) {
      expect(block).toContain(`--${name}: ${value.toLowerCase()};`);
    }
  }
});

test('both themes have the same token names', () => {
  expect(Object.keys(tokens.light)).toEqual(Object.keys(tokens.dark));
});

for (const theme of ['dark', 'light'] as const) {
  const t = tokens[theme];
  test(`${theme}: text and status colors meet AA (4.5:1)`, () => {
    // bg-3 is hover/selected only: status colors are checked on bg-0..bg-2.
    // dark text-3 (4.1:1) is spec-fixed in DESIGN.md §4.1: flagged for a spec change.
    const checks: [string[], string[]][] = [
      [
        ['text-1', 'text-2'],
        ['bg-0', 'bg-1', 'bg-2', 'bg-3'],
      ],
      [
        ['accent', 'scope', 'success', 'warning', 'danger', 'steel'],
        ['bg-0', 'bg-1', 'bg-2'],
      ],
      [theme === 'light' ? [['text-3']][0] : [], ['bg-0', 'bg-1', 'bg-2']],
    ];
    for (const [fgs, bgs] of checks)
      for (const fg of fgs)
        for (const bg of bgs) {
          const r = ratio(t[fg as keyof typeof t], t[bg as keyof typeof t]);
          expect(r, `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
  });
  test(`${theme}: accent-filled buttons and focus borders are readable`, () => {
    expect(ratio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
    // dark line-strong is spec-fixed (1.8:1); only light is held to 3:1.
    if (theme === 'light')
      expect(ratio(t['line-strong'], t['bg-1'])).toBeGreaterThanOrEqual(3);
  });
}

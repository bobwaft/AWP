// @vitest-environment jsdom
import type { SpecSnapshot, Theme } from '@awp/protocol';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { themePreviewHtml } from '../lib/themePreview';

const call = vi.fn();
vi.mock('../lib/engine', () => ({ engine: { call, on: () => () => {} } }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: async () => ['/tmp/mood.png'],
}));
const { FormCard } = await import('./FormCard');
const { ThemesPanel } = await import('./ThemesPanel');
const { ToastProvider } = await import('./Toast');

afterEach(() => {
  cleanup();
  call.mockReset();
});

const tokens = {
  colors: {
    bg: '#FFFFFF',
    surface: '#F4F4F5',
    text: '#111111',
    textMuted: '#555555',
    accent: '#0B5FFF',
    onAccent: '#FFFFFF',
    line: '#D4D4D8',
    success: '#15803D',
    warning: '#92400E',
    danger: '#B91C1C',
  },
  fonts: { sans: 'Inter, sans-serif', mono: 'monospace' },
  radius: 8,
  spacing: 4,
  density: 'comfortable',
  motion: 'subtle',
} as const;
const theme = (id: string): Theme => ({
  id,
  name: id.toUpperCase(),
  description: `${id} desc`,
  tokens: { ...tokens },
});
const snap = (o: object): SpecSnapshot =>
  ({
    stage: 'design',
    specFile: 'docs/DESIGN.md',
    busy: null,
    chat: [],
    critique: null,
    rounds: 0,
    readiness: null,
    blocking: 0,
    pending: { question: null, form: null, permission: null },
    unsure: [],
    declined: [],
    themes: null,
    picked: null,
    ...o,
  }) as SpecSnapshot;

test('preview html uses the theme tokens and never lets a font stack break out of the style', () => {
  const html = themePreviewHtml({
    ...tokens,
    colors: { ...tokens.colors, accent: '#123456' },
  });
  expect(html).toContain('background:#123456');
  expect(html).toContain('Primary');
  const evil = themePreviewHtml({
    ...tokens,
    fonts: { sans: 'x;}</style><script>alert(1)</script>', mono: 'monospace' },
  });
  expect(evil).not.toContain('<script>');
});

test('theme cards render isolated, script-free previews and pick through the engine', async () => {
  call.mockImplementation(async (m: string) =>
    m === 'design.refs' ? { files: [], links: [] } : 'ok',
  );
  render(
    <ToastProvider>
      <ThemesPanel
        snap={snap({
          themes: [theme('daylight'), theme('night')],
          picked: { themeId: 'night', name: 'NIGHT', tokens },
        })}
      />
    </ToastProvider>,
  );
  const frames = screen.getAllByTitle(/preview$/) as HTMLIFrameElement[];
  expect(frames).toHaveLength(2);
  for (const f of frames) {
    expect(f.getAttribute('sandbox')).toBe('');
    expect(f.getAttribute('srcdoc')).toContain('Sample card');
  }
  expect(screen.getByText('Picked')).toBeTruthy();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Pick this theme' })[0],
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('design.pickTheme', {
      themeId: 'daylight',
    }),
  );
});

test('references: add files and links go to the engine; with no themes it offers to propose', async () => {
  call.mockImplementation(async (m: string, p: any) =>
    m === 'design.refs'
      ? { files: [], links: [] }
      : m === 'design.addRef'
        ? {
            files: [{ name: 'mood.png', path: 'docs/design/refs/mood.png' }],
            links: [{ url: p.source, kind: 'url' }],
          }
        : 'ok',
  );
  render(
    <ToastProvider>
      <ThemesPanel snap={snap({})} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add files…' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('design.addRef', {
      source: '/tmp/mood.png',
    }),
  );
  fireEvent.change(screen.getByLabelText(/^Link/), {
    target: { value: 'https://example.com/x' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('design.addRef', {
      source: 'https://example.com/x',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Propose themes' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('design.propose', {
      feedback: undefined,
    }),
  );
});

test('design form: contrast readout, font pairing preview and sliders', () => {
  const fields = [
    { id: 'color_bg', label: 'Background', type: 'color', required: true },
    { id: 'color_text', label: 'Text', type: 'color', required: true },
    { id: 'font_sans', label: 'Interface font', type: 'font', required: true },
    {
      id: 'radius',
      label: 'Radius',
      type: 'number',
      min: 0,
      max: 32,
      required: true,
    },
  ] as const;
  render(
    <FormCard
      form={{
        title: 'Design tokens',
        fields: [...fields],
        prefill: {
          color_bg: '#FFFFFF',
          color_text: '#777777',
          font_sans: 'Georgia, serif',
          radius: 6,
        },
        aiFilled: [],
        orphaned: false,
      }}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByText(/Contrast 4\.5:1|Contrast 4\.4:1/)).toBeTruthy();
  expect(screen.getByText(/needs 4\.5:1/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/^Text/), {
    target: { value: '#000000' },
  });
  expect(screen.getByText(/meets 4\.5:1/)).toBeTruthy();
  expect(
    screen.getByText(/The quick brown fox/).getAttribute('style'),
  ).toContain('Georgia');
  const slider = screen.getByLabelText(/^Radius/) as HTMLInputElement;
  expect(slider.type).toBe('range');
  fireEvent.change(slider, { target: { value: '12' } });
  expect(screen.getByText('12')).toBeTruthy();
});

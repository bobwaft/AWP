import { z } from 'zod';

const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color like #1A2B3C');

export const DesignTokens = z.object({
  colors: z.object({
    bg: Hex,
    surface: Hex,
    text: Hex,
    textMuted: Hex,
    accent: Hex,
    onAccent: Hex,
    line: Hex,
    success: Hex,
    warning: Hex,
    danger: Hex,
  }),
  fonts: z.object({ sans: z.string().min(1), mono: z.string().min(1) }),
  /** Corner radius in px. */
  radius: z.number().min(0).max(32),
  /** Base spacing unit in px; the scale is multiples of it. */
  spacing: z.number().min(2).max(8),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  motion: z.enum(['none', 'subtle', 'expressive']),
});
export type DesignTokens = z.infer<typeof DesignTokens>;

export const Theme = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  tokens: DesignTokens,
});
export type Theme = z.infer<typeof Theme>;

export const ThemesInput = z.object({ themes: z.array(Theme).min(2).max(3) });

export const DesignRefs = z.object({
  files: z.array(z.object({ name: z.string(), path: z.string() })),
  links: z.array(z.object({ url: z.string(), kind: z.enum(['url', 'figma']) })),
});
export type DesignRefs = z.infer<typeof DesignRefs>;

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs that must meet AA (4.5:1) for a theme to be accepted. */
export function contrastFailures(t: DesignTokens): string[] {
  const c = t.colors;
  const pairs: [string, string, string][] = [
    ['text on background', c.text, c.bg],
    ['text on surface', c.text, c.surface],
    ['muted text on background', c.textMuted, c.bg],
    ['text on accent', c.onAccent, c.accent],
  ];
  return pairs
    .filter(([, a, b]) => contrastRatio(a, b) < 4.5)
    .map(
      ([label, a, b]) =>
        `${label} is ${contrastRatio(a, b).toFixed(1)}:1 (needs 4.5:1)`,
    );
}

export const DENSITY_SPACING = {
  compact: 3,
  comfortable: 4,
  spacious: 5,
} as const;

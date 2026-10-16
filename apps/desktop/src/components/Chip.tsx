import type { ReactNode } from 'react';

const TONES = {
  neutral: 'text-text-2 border-line',
  success: 'text-success border-success',
  warning: 'text-warning border-warning',
  danger: 'text-danger border-danger',
  accent: 'text-accent border-accent',
};

// Status always pairs color with a text label (DESIGN.md §4.1).
export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 text-xs ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

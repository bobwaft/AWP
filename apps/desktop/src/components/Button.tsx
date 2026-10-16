import type { ButtonHTMLAttributes } from 'react';

const VARIANTS = {
  primary: 'bg-accent text-on-accent border-transparent hover:brightness-110',
  secondary: 'bg-bg-2 text-text-1 border-line hover:bg-bg-3',
  ghost: 'bg-transparent text-text-1 border-transparent hover:bg-bg-3',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-8 min-w-8 items-center justify-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

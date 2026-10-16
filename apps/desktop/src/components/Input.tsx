import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, id, className = '', ...rest }: Props) {
  const inputId = id ?? `in-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm text-text-2">
        {label}
      </label>
      <input
        id={inputId}
        className={`min-h-8 rounded-sm border border-line bg-bg-2 px-3 text-text-1 placeholder:text-text-3 focus:border-line-strong ${className}`}
        {...rest}
      />
    </div>
  );
}

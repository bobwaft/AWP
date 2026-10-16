import { type ReactNode, useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
};

export function Dialog({ open, onClose, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,button,[tabindex]')?.focus();
    return () => prev?.focus();
  }, [open]);

  if (!open) return null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled on the dialog itself
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-lg rounded-md border border-line-strong bg-bg-1 shadow-[0_8px_32px_#00000080]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return onClose();
          if (e.key !== 'Tab') return;
          const f = [
            ...(ref.current?.querySelectorAll<HTMLElement>(
              'input,button:not([tabindex="-1"])',
            ) ?? []),
          ];
          if (!f.length) return;
          const end = e.shiftKey ? f[0] : f[f.length - 1];
          if (document.activeElement === end) {
            e.preventDefault();
            (e.shiftKey ? f[f.length - 1] : f[0]).focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

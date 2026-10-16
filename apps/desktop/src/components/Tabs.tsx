import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';

export type Tab = { id: string; label: string; content: ReactNode };

export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const uid = useId();

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    const tab = tabs[(next + tabs.length) % tabs.length];
    setActive(tab.id);
    document.getElementById(`${uid}-tab-${tab.id}`)?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 border-b border-line"
        onKeyDown={onKeyDown}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${uid}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            aria-controls={`${uid}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => setActive(t.id)}
            className={`min-h-8 border-b-2 px-3 text-sm ${t.id === active ? 'border-accent text-text-1' : 'border-transparent text-text-2 hover:text-text-1'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${uid}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

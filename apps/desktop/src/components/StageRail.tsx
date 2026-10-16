import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  Crosshair,
  Lock,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import {
  mockStageState,
  STAGES,
  type StageState,
  stageAriaLabel,
  stageKeyLabel,
} from '../lib/stages';

const ICON = {
  locked: Lock,
  done: Check,
  stale: TriangleAlert,
  current: Crosshair,
};
const COLOR: Record<StageState, string> = {
  locked: 'text-text-3',
  current: 'text-accent',
  done: 'text-steel',
  stale: 'text-warning',
};

type Props = { selected: number; onSelect: (n: number) => void };

export function StageRail({ selected, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <nav
      aria-label="Stages"
      className={`flex shrink-0 flex-col border-r border-line bg-bg-1 py-2 ${expanded ? 'w-[220px]' : 'w-14'}`}
    >
      <ol className="flex flex-1 flex-col">
        {STAGES.map((s) => {
          const state = mockStageState(s.n);
          const Icon = ICON[state];
          return (
            <li key={s.n}>
              <button
                type="button"
                aria-label={stageAriaLabel(s, state)}
                aria-current={s.n === selected ? 'page' : undefined}
                onClick={() => onSelect(s.n)}
                className={`flex min-h-9 w-full items-center gap-2 px-2 hover:bg-bg-3 ${s.n === selected ? 'bg-bg-3' : ''} ${COLOR[state]}`}
              >
                <span className="font-mono text-xs">
                  {String(s.n).padStart(2, '0')}
                </span>
                {expanded && (
                  <span className="flex-1 truncate text-left text-sm text-text-1">
                    {s.label}
                  </span>
                )}
                {Icon && <Icon size={16} strokeWidth={1.5} aria-hidden />}
                {expanded && (
                  <kbd className="font-mono text-xs text-text-3">
                    {stageKeyLabel(s.n)}
                  </kbd>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        aria-label={expanded ? 'Collapse stage rail' : 'Expand stage rail'}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="mx-2 flex min-h-8 items-center justify-center rounded-sm text-text-2 hover:bg-bg-3"
      >
        {expanded ? (
          <ChevronsLeft size={16} strokeWidth={1.5} />
        ) : (
          <ChevronsRight size={16} strokeWidth={1.5} />
        )}
      </button>
    </nav>
  );
}

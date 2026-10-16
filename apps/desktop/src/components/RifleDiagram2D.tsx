import { useProject } from '../lib/project';
import { STAGES, type StageState, stageAriaLabel } from '../lib/stages';

// Hotspot centres in the 1000×300 viewBox, one per stage (DESIGN.md §2.2).
const SPOTS: Record<number, [number, number]> = {
  1: [110, 245],
  2: [330, 150],
  3: [420, 62],
  4: [690, 215],
  5: [510, 108],
  6: [620, 150],
  7: [560, 62],
  8: [290, 185],
  9: [850, 150],
  10: [950, 150],
};

const RING: Record<StageState, { stroke: string; dash?: string }> = {
  locked: { stroke: 'var(--text-3)', dash: '2 3' },
  current: { stroke: 'var(--accent-bright)' },
  done: { stroke: 'var(--steel)' },
  stale: { stroke: 'var(--warning)', dash: '5 3' },
};

type Props = { onSelect: (n: number) => void; selected?: number };

export function RifleDiagram2D({ onSelect, selected }: Props) {
  const { stateOf } = useProject();
  return (
    // biome-ignore lint/a11y/useSemanticElements: SVG has no fieldset
    <svg
      viewBox="0 0 1000 300"
      role="group"
      aria-label="Rifle diagram"
      className="h-auto w-full min-w-[960px] max-w-5xl"
    >
      <g fill="none" stroke="var(--line-strong)" strokeWidth="1.5">
        <path d="M40 170 L40 120 Q40 110 60 108 L250 120 L250 175 L130 200 L90 280 L50 280 Z" />
        <rect x="250" y="125" width="130" height="45" rx="3" />
        <rect x="380" y="140" width="520" height="14" />
        <path d="M900 134 h40 v36 h-40 z" />
        <rect x="340" y="75" width="260" height="26" rx="13" />
        <path d="M370 101 v24 M570 101 v24" />
        <path d="M280 125 v-20 h20 v20" />
        <path d="M690 154 L660 235 M700 154 L730 235" />
        <path d="M60 255 h100 v30 h-100 z" />
        <circle cx="950" cy="150" r="34" strokeDasharray="1 5" />
      </g>
      {STAGES.map((s) => {
        const state = stateOf(s.n);
        const [x, y] = SPOTS[s.n];
        const ring = RING[state];
        return (
          // biome-ignore lint/a11y/useSemanticElements: SVG has no native button
          <g
            key={s.n}
            role="button"
            tabIndex={0}
            aria-label={stageAriaLabel(s, state)}
            aria-current={s.n === selected ? 'page' : undefined}
            onClick={() => onSelect(s.n)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(s.n);
              }
            }}
            className="cursor-pointer"
          >
            <circle
              cx={x}
              cy={y}
              r="17"
              fill="var(--bg-1)"
              stroke={ring.stroke}
              strokeWidth="2"
              strokeDasharray={ring.dash}
            />
            {state === 'current' && (
              <circle cx={x} cy={y} r="22" fill="var(--accent-dim)" />
            )}
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="12"
              fill="var(--text-1)"
            >
              {state === 'done' ? '✓' : String(s.n).padStart(2, '0')}
            </text>
            <text
              x={x}
              y={y + 34}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              letterSpacing="0.8"
              fill="var(--text-2)"
            >
              {s.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

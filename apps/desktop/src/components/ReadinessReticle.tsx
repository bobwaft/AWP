// Informational only: never gates anything (PRD 5.2.1).
export function ReadinessReticle({ value }: { value: number | null }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={
        value === null
          ? 'Readiness not scored yet'
          : `Readiness ${value} of 100`
      }
    >
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth="4"
        />
        {value !== null && (
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeDasharray={`${(value / 100) * c} ${c}`}
            transform="rotate(-90 28 28)"
          />
        )}
        <path
          d="M28 2v8M28 46v8M2 28h8M46 28h8"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
        />
      </svg>
      <span className="font-mono text-lg">{value ?? '–'}</span>
    </div>
  );
}

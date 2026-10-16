import type { Critique } from '@awp/protocol';

export function QuestionList({
  critique,
  onPick,
}: {
  critique: Critique | null;
  onPick: (text: string) => void;
}) {
  const qs = critique?.questions ?? [];
  return (
    <section
      aria-label="Open questions"
      className="flex flex-col gap-1 border-t border-line p-3"
    >
      <h2 className="hud">Open questions ({qs.length})</h2>
      {qs.length === 0 && (
        <p className="text-sm text-text-2">
          {critique ? 'None. Nothing is blocking.' : 'Not reviewed yet.'}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {qs.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onPick(q.text)}
              className="flex w-full items-start gap-2 text-left text-sm hover:bg-bg-3"
            >
              <span className={q.blocking ? 'text-danger' : 'text-text-2'}>
                {q.blocking ? '● blocking' : '○ optional'}
              </span>
              <span>{q.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

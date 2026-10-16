import { mergePhases, movePhase, type Phase, splitPhase } from '@awp/protocol';
import { ArrowDown, ArrowUp, Merge, Split } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { engine } from '../lib/engine';
import { Button } from './Button';
import { Chip } from './Chip';
import { MarkdownEditor } from './MarkdownEditor';

type Plan = { phases: Phase[]; errors: string[]; text: string };

/** Preview of PHASES.md as a row of rounds. Reorder/split/merge rewrite the file; the text editor edits it directly. */
export function PhaseBarrel({ refreshKey }: { refreshKey: string }) {
  const [plan, setPlan] = useState<Plan>({ phases: [], errors: [], text: '' });
  const [open, setOpen] = useState<number | null>(null);
  const [raw, setRaw] = useState(false);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await engine.call('plan.phases');
      setPlan(p);
      setText(p.text);
    } catch {}
  }, []);
  // refreshKey changes when the agent or a file edit touches the plan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload on refreshKey
  useEffect(() => void load(), [load, refreshKey]);
  useEffect(
    () =>
      engine.on((e) => {
        if (
          e.method === 'spec.changed' &&
          (e.params as { file: string }).file.endsWith('PHASES.md')
        )
          void load();
      }),
    [load],
  );

  const apply = async (next: Phase[]) => {
    const r = await engine.call('plan.savePhases', { phases: next });
    setPlan({ phases: next, errors: r.errors, text: '' });
    void load();
  };

  const saveText = (v: string) => {
    setText(v);
    void engine
      .call('spec.save', { file: 'docs/PHASES.md', content: v })
      .then(load);
  };

  if (plan.phases.length === 0 && plan.errors.length === 0 && !plan.text)
    return (
      <p className="text-text-2">
        No phase plan yet. It appears here after you pick a stack.
      </p>
    );

  return (
    <section aria-label="Phase plan" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="hud">Phase plan · {plan.phases.length} phases</h2>
        <Button
          variant="ghost"
          className="ml-auto"
          aria-pressed={raw}
          onClick={() => setRaw((r) => !r)}
        >
          {raw ? 'Back to barrel' : 'Edit as text'}
        </Button>
      </div>
      {plan.errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-danger">
          {plan.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {raw ? (
        <div className="h-96 border border-line">
          <MarkdownEditor value={text} onChange={saveText} />
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {plan.phases.map((p, i) => (
            <li key={p.n} className="rounded-md border border-line bg-bg-1">
              <div className="flex items-center gap-2 p-2">
                <span className="font-mono text-accent">
                  {String(p.n).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  className="flex-1 text-left"
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {p.title}
                </button>
                {p.ui && <Chip tone="accent">UI</Chip>}
                <span className="text-xs text-text-3">
                  {p.tasks.length} tasks
                </span>
                <Button
                  variant="ghost"
                  aria-label={`Move phase ${p.n} up`}
                  disabled={i === 0}
                  onClick={() => apply(movePhase(plan.phases, i, i - 1))}
                >
                  <ArrowUp size={14} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move phase ${p.n} down`}
                  disabled={i === plan.phases.length - 1}
                  onClick={() => apply(movePhase(plan.phases, i, i + 1))}
                >
                  <ArrowDown size={14} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Split phase ${p.n}`}
                  disabled={p.tasks.length < 2}
                  onClick={() => apply(splitPhase(plan.phases, i))}
                >
                  <Split size={14} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Merge phase ${p.n} with next`}
                  disabled={i === plan.phases.length - 1}
                  onClick={() => apply(mergePhases(plan.phases, i))}
                >
                  <Merge size={14} aria-hidden />
                </Button>
              </div>
              {open === i && (
                <div className="grid gap-3 border-t border-line p-3 text-sm [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  <div>
                    <p className="hud">GOAL</p>
                    <p>{p.goal}</p>
                  </div>
                  <div>
                    <p className="hud">TASKS</p>
                    <ul className="list-disc pl-4">
                      {p.tasks.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="hud">ACCEPTANCE</p>
                    <ul className="list-disc pl-4">
                      {p.acceptance.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="hud">YOU TEST</p>
                    <ul className="list-disc pl-4">
                      {p.checklist.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

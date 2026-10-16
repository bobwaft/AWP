import type { SpecSnapshot } from '@awp/protocol';
import { type ReactNode, useState } from 'react';
import { Button } from '../components/Button';
import { ChatPanel } from '../components/ChatPanel';
import { Dialog } from '../components/Dialog';
import { QuestionList } from '../components/QuestionList';
import { ReadinessReticle } from '../components/ReadinessReticle';
import { SpecPanel } from '../components/SpecPanel';
import { useToast } from '../components/Toast';
import { useSpec } from '../lib/spec';

const MAX_ROUNDS = 3;

export function SpecStageView({
  stage,
  extra,
}: {
  stage: 'ideation' | 'design';
  extra?: { label: string; node: (snap: SpecSnapshot) => ReactNode };
}) {
  const spec = useSpec(stage);
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [split, setSplit] = useState(40); // chat column width, percent
  const [anyway, setAnyway] = useState(false);
  const [reason, setReason] = useState('');
  const { snap } = spec;
  if (!snap)
    return (
      <p className="p-8 text-text-2">Open a project to start this stage.</p>
    );

  const capped = snap.rounds >= MAX_ROUNDS;
  const gateOpen = snap.rounds > 0 && snap.blocking === 0;
  const complete = async (overrideReason?: string) => {
    try {
      await spec.complete(overrideReason);
      setAnyway(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  const drag = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const move = (ev: PointerEvent) => {
      const r = box.getBoundingClientRect();
      const pct = ((ev.clientX - r.left) / r.width) * 100;
      const min = (360 / r.width) * 100;
      setSplit(Math.min(100 - min, Math.max(min, pct)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex h-full min-h-0">
      <div
        className="flex min-h-0 min-w-[360px] flex-col"
        style={{ width: `${split}%` }}
      >
        <div className="min-h-0 flex-1">
          <ChatPanel spec={spec} snap={snap} draft={draft} onDraft={setDraft} />
        </div>
        <QuestionList
          critique={snap.critique}
          onPick={(t) => setDraft((d) => `${d}${d ? '\n' : ''}Re: ${t}\n`)}
        />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only splitter */}
      <div
        onPointerDown={drag}
        className="w-1 shrink-0 cursor-col-resize bg-line"
      />
      <div className="flex min-h-0 min-w-[360px] flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <SpecPanel
            snap={snap}
            extra={extra && { label: extra.label, node: extra.node(snap) }}
          />
        </div>
        <div className="flex items-center gap-4 border-t border-line p-3">
          <ReadinessReticle value={snap.readiness} />
          <span className="text-sm text-text-2">
            {snap.rounds === 0
              ? 'Not reviewed yet'
              : `${snap.blocking} blocking · review ${snap.rounds}/${MAX_ROUNDS}`}
          </span>
          {capped && snap.blocking > 0 ? (
            <Button className="ml-auto" onClick={() => setAnyway(true)}>
              Complete anyway…
            </Button>
          ) : null}
          <Button
            variant="primary"
            className={capped && snap.blocking > 0 ? '' : 'ml-auto'}
            disabled={!gateOpen}
            onClick={() => complete()}
          >
            Complete stage
          </Button>
        </div>
      </div>
      <Dialog
        open={anyway}
        onClose={() => setAnyway(false)}
        label="Complete anyway"
      >
        <div className="flex flex-col gap-3 p-4">
          <h2 className="font-medium">
            Complete with {snap.blocking} blocking question
            {snap.blocking === 1 ? '' : 's'}?
          </h2>
          <ul className="list-disc pl-5 text-sm">
            {snap.critique?.questions
              .filter((q) => q.blocking)
              .map((q) => (
                <li key={q.id}>{q.text}</li>
              ))}
          </ul>
          <label className="flex flex-col gap-1 text-sm">
            Why are these fine to leave open?
            <input
              className="min-h-8 rounded-sm border border-line bg-bg-2 px-3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAnyway(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!reason.trim()}
              onClick={() => complete(reason.trim())}
            >
              Complete anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export const IdeationView = () => <SpecStageView stage="ideation" />;

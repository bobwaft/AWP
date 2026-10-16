import {
  type StackOption,
  VERIFY_KEYS,
  type VerifyCommands,
} from '@awp/protocol';
import { useState } from 'react';
import { engine } from '../lib/engine';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';

function OptionCard({
  option,
  onPick,
  disabled,
}: {
  option: StackOption;
  onPick: (v: Partial<VerifyCommands>) => void;
  disabled: boolean;
}) {
  const [verify, setVerify] = useState<VerifyCommands>(option.verify);
  const missing = VERIFY_KEYS.filter((k) => !verify[k].trim());
  const changed = Object.fromEntries(
    VERIFY_KEYS.filter((k) => verify[k] !== option.verify[k]).map((k) => [
      k,
      verify[k],
    ]),
  );
  return (
    <Card className="flex flex-col gap-3" aria-label={`Stack ${option.name}`}>
      <h3 className="font-medium">{option.name}</h3>
      <p className="text-sm text-text-2">{option.summary}</p>
      <ul className="text-sm">
        {option.stack.map((s) => (
          <li key={s} className="font-mono">
            {s}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="hud text-success">PROS</p>
          <ul className="list-disc pl-4">
            {option.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="hud text-warning">TRADE-OFFS</p>
          <ul className="list-disc pl-4">
            {option.cons.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-sm">
        <b>Why it fits:</b> {option.fit}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="hud">VERIFY COMMANDS</legend>
        {VERIFY_KEYS.map((k) => (
          <Input
            key={k}
            label={k[0].toUpperCase() + k.slice(1)}
            className="font-mono"
            value={verify[k]}
            onChange={(e) => setVerify({ ...verify, [k]: e.target.value })}
          />
        ))}
      </fieldset>
      <Button
        variant="primary"
        disabled={disabled || missing.length > 0}
        onClick={() => onPick(changed)}
      >
        Use this stack
      </Button>
    </Card>
  );
}

export function StackOptions({
  options,
  pickedId,
  busy,
  onError,
}: {
  options: StackOption[];
  pickedId?: string;
  busy: boolean;
  onError: (e: unknown) => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <section aria-label="Stack options" className="flex flex-col gap-3">
      <h2 className="hud">Stack options</h2>
      {pickedId && (
        <p className="text-sm text-success">
          Chosen: {options.find((o) => o.id === pickedId)?.name}. Picking
          another rewrites ARCHITECTURE.md and the phase plan.
        </p>
      )}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {options.map((o) => (
          <OptionCard
            key={o.id}
            option={o}
            disabled={busy}
            onPick={(verify) =>
              engine
                .call('plan.pickStack', {
                  optionId: o.id,
                  edits: { verify, notes: notes || undefined },
                })
                .catch(onError)
            }
          />
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Notes to add to ARCHITECTURE.md (optional)
        <textarea
          rows={2}
          className="rounded-sm border border-line bg-bg-2 p-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
    </section>
  );
}

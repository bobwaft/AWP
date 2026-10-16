import type { Fix, ToolStatus } from '@awp/protocol';
import { AlertTriangle, Check, CircleDashed, Loader, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';

export type CardState = ToolStatus['state'] | 'checking' | 'waiting';

const LABEL: Record<CardState, string> = {
  checking: 'Checking…',
  missing: 'Not installed',
  needs_signin: 'Needs sign-in',
  outdated: 'Outdated',
  ready: 'Ready',
  error: 'Error',
  waiting: 'Waiting for the terminal…',
};

function Icon({ state }: { state: CardState }) {
  const p = { size: 16, 'aria-hidden': true } as const;
  if (state === 'ready') return <Check {...p} className="text-success" />;
  if (state === 'checking' || state === 'waiting')
    return <Loader {...p} className="text-text-2" />;
  if (state === 'error') return <X {...p} className="text-danger" />;
  if (state === 'missing' || state === 'needs_signin' || state === 'outdated')
    return <AlertTriangle {...p} className="text-warning" />;
  return <CircleDashed {...p} />;
}

type Props = {
  name: string;
  state: CardState;
  status?: ToolStatus;
  fix?: Fix;
  /** Non-zero exit code of the last fix run. */
  failedExit?: boolean;
  onFix: () => void;
  onRecheck: () => void;
};

export function SetupCard({
  name,
  state,
  status,
  fix,
  failedExit,
  onFix,
  onRecheck,
}: Props) {
  const [manual, setManual] = useState(false);
  const needsAction =
    state === 'missing' ||
    state === 'needs_signin' ||
    state === 'outdated' ||
    state === 'error' ||
    state === 'waiting';
  return (
    <Card className="flex flex-col gap-2" aria-label={name}>
      <div className="flex items-center gap-2">
        <Icon state={state} />
        <h3 className="font-medium">{name}</h3>
        <span className="ml-auto text-sm text-text-2">{LABEL[state]}</span>
      </div>
      {state === 'ready' && status && (
        <p className="text-sm text-text-2">
          {[
            status.version && `v${status.version}`,
            status.account,
            status.plan && `${status.plan} plan`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {state === 'outdated' && (
        <p className="text-sm text-text-2">
          This version is outside the range AWP is tested with. Updating is
          safest.
        </p>
      )}
      {failedExit && (
        <p className="text-sm text-danger">
          That didn't finish. The terminal shows what happened.
        </p>
      )}
      {needsAction && fix && (
        <>
          <p className="text-sm text-text-2">{fix.explain}</p>
          <code className="rounded-sm bg-bg-2 px-2 py-1 font-mono text-sm">
            {fix.command}
          </code>
          <div className="flex gap-2">
            <Button variant="primary" onClick={onFix}>
              Fix in terminal
            </Button>
            <Button
              variant="ghost"
              onClick={() => setManual((m) => !m)}
              aria-expanded={manual}
            >
              Do it manually
            </Button>
            <Button variant="ghost" onClick={onRecheck}>
              Re-check
            </Button>
          </div>
          {manual && (
            <div className="text-sm">
              <ol className="list-decimal pl-5">
                {fix.manual.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <a
                className="text-accent underline"
                href={fix.manual.url}
                target="_blank"
                rel="noreferrer"
              >
                Official instructions
              </a>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

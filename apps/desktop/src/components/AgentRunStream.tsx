import type { AgentEvent } from '@awp/protocol';
import { Button } from './Button';
import { Chip } from './Chip';

type Props = {
  events: AgentEvent[];
  running: boolean;
  model?: string;
  onStop: () => void;
};

function Row({ e }: { e: AgentEvent }) {
  switch (e.type) {
    case 'message':
      return <p className="whitespace-pre-wrap">{e.text}</p>;
    case 'tool_call':
      return <p className="font-mono text-sm text-text-2">▸ {e.name}</p>;
    case 'tool_result':
      return (
        <p
          className={`font-mono text-sm ${e.ok ? 'text-text-3' : 'text-danger'}`}
        >
          {e.ok ? '✓' : '✗'} {e.summary}
        </p>
      );
    case 'file_change':
      return (
        <p className="font-mono text-sm text-accent">
          {e.kind} {e.path}
        </p>
      );
    case 'command':
      return <p className="font-mono text-sm">$ {e.cmd}</p>;
    case 'error':
      return <p className="text-danger">{e.message}</p>;
    case 'done':
      return <p className="hud">Run {e.status}</p>;
    default:
      return null; // session / usage are shown in the header
  }
}

export function AgentRunStream({ events, running, model, onStop }: Props) {
  const usage = [...events].reverse().find((e) => e.type === 'usage');
  return (
    <section aria-label="Agent run" className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        {model && <Chip>{model}</Chip>}
        {usage?.type === 'usage' && (
          <span className="hud">
            {usage.inputTokens} in · {usage.outputTokens} out
            {usage.costUsd !== undefined && ` · $${usage.costUsd.toFixed(4)}`}
          </span>
        )}
        <Button
          variant="secondary"
          className="ml-auto"
          disabled={!running}
          onClick={onStop}
        >
          Stop
        </Button>
      </header>
      <div role="log" aria-live="polite" className="flex flex-col gap-2">
        {events.map((e, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
          <Row key={i} e={e} />
        ))}
      </div>
    </section>
  );
}

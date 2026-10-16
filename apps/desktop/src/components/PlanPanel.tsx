import type { SpecSnapshot } from '@awp/protocol';
import { PhaseBarrel } from './PhaseBarrel';
import { StackOptions } from './StackOptions';
import { useToast } from './Toast';

export function PlanPanel({ snap }: { snap: SpecSnapshot }) {
  const toast = useToast();
  const fail = (e: unknown) =>
    toast(e instanceof Error ? e.message : String(e));
  return (
    <div className="flex flex-col gap-6 p-4">
      {snap.stackOptions ? (
        <StackOptions
          options={snap.stackOptions}
          pickedId={snap.stackPicked?.optionId}
          busy={!!snap.busy}
          onError={fail}
        />
      ) : (
        <p className="text-text-2">
          Tell AWP about your platform, languages and hosting in the chat. Two
          or three stack options will appear here to compare.
        </p>
      )}
      {snap.stackPicked && (
        <PhaseBarrel refreshKey={`${snap.busy}:${snap.rounds}`} />
      )}
    </div>
  );
}

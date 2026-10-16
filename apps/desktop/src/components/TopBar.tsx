import { STAGE_IDS } from '@awp/protocol';
import { Search, Settings } from 'lucide-react';
import { useProject } from '../lib/project';
import { STAGES } from '../lib/stages';
import { Button } from './Button';

type Props = { onOpenPalette: () => void; onOpenSettings: () => void };

export function TopBar({ onOpenPalette, onOpenSettings }: Props) {
  const { project } = useProject();
  const n = project ? STAGE_IDS.indexOf(project.current) + 1 : 1;
  const stage = STAGES[n - 1];
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-bg-1 px-4">
      <span className="font-mono font-medium tracking-widest">AWP</span>
      <span className="text-text-2">
        {project?.project.name ?? 'No project'}
      </span>
      <span className="hud">
        Stage {n}/10 · {stage.label}
      </span>
      <span className="flex-1" />
      <Button
        variant="ghost"
        onClick={onOpenPalette}
        aria-label="Open command palette"
      >
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <kbd className="font-mono text-xs text-text-2">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" onClick={onOpenSettings} aria-label="Settings">
        <Settings size={16} strokeWidth={1.5} aria-hidden />
      </Button>
    </header>
  );
}

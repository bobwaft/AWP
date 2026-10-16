import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Input } from '../components/Input';
import { useToast } from '../components/Toast';
import { currentOs } from '../lib/os';
import { useProject } from '../lib/project';
import { STAGES } from '../lib/stages';

const stageLabel = (id?: string) =>
  STAGES.find((s) => s.label.toLowerCase() === id)?.label ?? id ?? '';

export function Dashboard({ onRerunSetup }: { onRerunSetup: () => void }) {
  const { recents, open, create } = useProject();
  const toast = useToast();
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const sep = currentOs() === 'win32' ? '\\' : '/';

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  const choose = async () => {
    const dir = await pickFolder({ directory: true }).catch(() => null);
    return typeof dir === 'string' ? dir : null;
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Projects</h1>
      <Card className="flex flex-col gap-3" aria-label="New project">
        <h2 className="hud">New project</h2>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex items-end gap-2">
          <Input
            label="Parent folder"
            className="flex-1"
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          />
          <Button onClick={async () => setParent((await choose()) ?? parent)}>
            Choose…
          </Button>
        </div>
        <Button
          variant="primary"
          disabled={!name.trim() || !parent.trim()}
          onClick={() =>
            run(() =>
              create(
                `${parent.replace(/[\\/]$/, '')}${sep}${name.trim()}`,
                name.trim(),
              ),
            )
          }
        >
          Create project
        </Button>
      </Card>
      <section aria-label="Recent projects" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="hud">Recent</h2>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={async () => {
              const dir = await choose();
              if (dir) await run(() => open(dir));
            }}
          >
            Open folder…
          </Button>
        </div>
        {recents.length === 0 && (
          <p className="text-text-2">No projects yet.</p>
        )}
        {recents.map((p) => (
          <Card key={p.path} className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="truncate font-mono text-xs text-text-3">{p.path}</p>
              {p.missing ? (
                <Chip tone="danger">Folder missing</Chip>
              ) : (
                <p className="text-sm text-text-2">
                  Stage: {stageLabel(p.stage)} · Phases {p.phasesPassed}/
                  {p.phasesTotal}
                  {p.lastActivity &&
                    ` · ${new Date(p.lastActivity).toLocaleDateString()}`}
                  {p.openBugs > 0 &&
                    ` · ${p.openBugs} open ${p.openBugs === 1 ? 'bug' : 'bugs'}`}
                </p>
              )}
            </div>
            <Button
              disabled={p.missing}
              onClick={() => run(() => open(p.path))}
            >
              Open
            </Button>
          </Card>
        ))}
      </section>
      <Button variant="ghost" className="self-start" onClick={onRerunSetup}>
        Re-run setup
      </Button>
    </div>
  );
}

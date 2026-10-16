import { useState } from 'react';
import { AgentRunStream } from '../components/AgentRunStream';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useProject } from '../lib/project';
import { useRun } from '../lib/run';

// Hidden dev screen (command palette: "Dev: run prompt").
export function DevRun() {
  const run = useRun();
  const [prompt, setPrompt] = useState('list the files in this folder');
  const { project } = useProject();
  // Default to the open project; never `.` (the engine cwd may be huge).
  const [cwd, setCwd] = useState(project?.project.path ?? '');
  const [adapter, setAdapter] = useState<'claude' | 'fake'>('claude');
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Run prompt</h1>
      <Input
        label="Prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Input
        label="Folder"
        value={cwd}
        onChange={(e) => setCwd(e.target.value)}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={adapter === 'fake'}
          onChange={(e) => setAdapter(e.target.checked ? 'fake' : 'claude')}
        />
        Use fake adapter (no tokens)
      </label>
      <Button
        variant="primary"
        disabled={run.running || !prompt || !cwd.trim()}
        onClick={() =>
          run.start({
            prompt,
            cwd,
            adapter,
            fixture: 'claude-list-files',
            model: 'haiku', // cheap and quick for the dev screen
          })
        }
      >
        Run
      </Button>
      <AgentRunStream
        events={run.events}
        running={run.running}
        model={run.model}
        onStop={run.stop}
      />
    </div>
  );
}

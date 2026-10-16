import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';

export type Command = { id: string; label: string; run: () => void };
type Props = { open: boolean; onClose: () => void; commands: Command[] };

export function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const shown = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );
  const pick = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown')
      setIndex((i) => Math.max(0, Math.min(i + 1, shown.length - 1)));
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
    else if (e.key === 'Enter') pick(shown[index]);
    else return;
    e.preventDefault();
  };

  return (
    <Dialog open={open} onClose={onClose} label="Command palette">
      <input
        aria-label="Search commands"
        placeholder="Jump to a stage or run an action"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={onKeyDown}
        className="w-full border-b border-line bg-transparent px-4 py-3 text-text-1 placeholder:text-text-3"
      />
      <ul aria-label="Commands" className="max-h-80 overflow-auto p-2">
        {shown.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              tabIndex={-1}
              aria-current={i === index}
              onClick={() => pick(c)}
              className={`w-full rounded-sm px-3 py-2 text-left ${i === index ? 'bg-bg-3' : ''}`}
            >
              {c.label}
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-2 text-text-2">No matching commands.</li>
        )}
      </ul>
    </Dialog>
  );
}

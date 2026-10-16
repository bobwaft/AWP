import type { SpecSnapshot } from '@awp/protocol';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Markdown from 'react-markdown';
import { engine } from '../lib/engine';
import { Button } from './Button';
import { MarkdownEditor } from './MarkdownEditor';

type Mode = 'edit' | 'preview' | 'diff' | 'extra';

export function SpecPanel({
  snap,
  extra,
}: {
  snap: SpecSnapshot;
  /** An additional first tab (the Design stage's themes). */
  extra?: { label: string; node: ReactNode };
}) {
  const [mode, setMode] = useState<Mode>(extra ? 'extra' : 'edit');
  const [content, setContent] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const dirty = useRef(false);
  const saveVersion = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const readOnly = snap.busy === 'synthesizer'; // the agent is writing

  const reload = useCallback(async () => {
    try {
      const r = await engine.call('spec.read', { file: snap.specFile });
      setContent(r.content);
      setBase(r.base);
    } catch {}
  }, [snap.specFile]);

  useEffect(() => {
    void reload();
  }, [reload]);
  // Reload whenever the agent finishes a phase, and on external edits (never over unsaved typing).
  const trigger = `${snap.busy}:${snap.chat.length}`;
  useEffect(() => {
    if (trigger && !dirty.current) void reload();
  }, [trigger, reload]);
  useEffect(
    () =>
      engine.on((e) => {
        if (e.method === 'spec.changed' && !dirty.current) void reload();
      }),
    [reload],
  );

  const onChange = (v: string) => {
    setContent(v);
    dirty.current = true;
    clearTimeout(saveTimer.current);
    const version = ++saveVersion.current;
    saveTimer.current = setTimeout(async () => {
      const ok = await engine
        .call('spec.save', { file: snap.specFile, content: v })
        .then(() => true)
        .catch(() => false);
      // Only a save of the newest text clears "dirty"; a failed save keeps it so the edit is not overwritten.
      if (ok && version === saveVersion.current) dirty.current = false;
    }, 600);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1">
        <span className="hud mr-2">{snap.specFile.replace('docs/', '')}</span>
        {extra && (
          <Button
            variant={mode === 'extra' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'extra'}
            onClick={() => setMode('extra')}
          >
            {extra.label}
          </Button>
        )}
        {(['edit', 'preview', 'diff'] as const).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'secondary' : 'ghost'}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </Button>
        ))}
        {readOnly && (
          <span className="hud ml-auto">AI is writing · read-only</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'extra' && extra?.node}
        {mode === 'edit' && (
          <MarkdownEditor
            value={content}
            readOnly={readOnly}
            onChange={onChange}
          />
        )}
        {mode === 'preview' && (
          <article className="prose-sm max-w-none p-4 [&_h1]:text-xl [&_h2]:mt-4 [&_h2]:text-lg [&_li]:ml-5 [&_li]:list-disc">
            <Markdown>{content || '*Nothing yet.*'}</Markdown>
          </article>
        )}
        {mode === 'diff' &&
          (base === null ? (
            <p className="p-4 text-text-2">No AI changes yet.</p>
          ) : (
            <MarkdownEditor
              value={content}
              readOnly={readOnly}
              original={base}
              onChange={onChange}
            />
          ))}
      </div>
    </div>
  );
}

import type { DesignRefs, SpecSnapshot } from '@awp/protocol';
import { open as pickFiles } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useState } from 'react';
import { engine } from '../lib/engine';
import { Button } from './Button';
import { Input } from './Input';
import { ThemeCard } from './ThemeCard';
import { useToast } from './Toast';

export function ThemesPanel({ snap }: { snap: SpecSnapshot }) {
  const toast = useToast();
  const [refs, setRefs] = useState<DesignRefs>({ files: [], links: [] });
  const [url, setUrl] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadRefs = useCallback(async () => {
    try {
      setRefs(await engine.call('design.refs'));
    } catch {}
  }, []);
  useEffect(() => void loadRefs(), [loadRefs]);

  const fail = (e: unknown) =>
    toast(e instanceof Error ? e.message : String(e));
  const addRef = async (source: string) => {
    try {
      setRefs(await engine.call('design.addRef', { source }));
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <section aria-label="References" className="flex flex-col gap-2">
        <h2 className="hud">References</h2>
        <p className="text-sm text-text-2">
          Add images, PDFs, sketches, links or a Figma file. Themes will reflect
          them.
        </p>
        <div className="flex items-end gap-2">
          <Button
            onClick={async () => {
              const picked = await pickFiles({
                multiple: true,
                filters: [
                  {
                    name: 'Images and PDFs',
                    extensions: [
                      'png',
                      'jpg',
                      'jpeg',
                      'gif',
                      'webp',
                      'svg',
                      'pdf',
                    ],
                  },
                ],
              }).catch(() => null);
              for (const f of Array.isArray(picked)
                ? picked
                : picked
                  ? [picked]
                  : [])
                await addRef(f);
            }}
          >
            Add files…
          </Button>
          <Input
            label="Link (URL or Figma)"
            className="flex-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            disabled={!url.trim()}
            onClick={async () => {
              await addRef(url.trim());
              setUrl('');
            }}
          >
            Add link
          </Button>
        </div>
        <ul className="text-sm">
          {refs.files.map((f) => (
            <li key={f.path} className="font-mono">
              {f.path}
            </li>
          ))}
          {refs.links.map((l) => (
            <li key={l.url}>
              {l.kind === 'figma' ? 'Figma: ' : ''}
              {l.url}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Themes" className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <h2 className="hud">Themes</h2>
          <Input
            label="Feedback for new proposals"
            className="flex-1"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <Button
            variant={snap.themes ? 'secondary' : 'primary'}
            disabled={!!snap.busy}
            onClick={() =>
              engine
                .call('design.propose', { feedback: feedback || undefined })
                .catch(fail)
            }
          >
            {snap.themes ? 'Propose again' : 'Propose themes'}
          </Button>
        </div>
        {snap.busy === 'themer' && <p className="hud">Designing themes…</p>}
        {!snap.themes && snap.busy !== 'themer' && (
          <p className="text-text-2">
            Chat about the look you want, then propose themes. Two or three will
            appear here with a live preview.
          </p>
        )}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {snap.themes?.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              picked={snap.picked?.themeId === t.id}
              onPick={() =>
                engine.call('design.pickTheme', { themeId: t.id }).catch(fail)
              }
            />
          ))}
        </div>
        {snap.pending.form?.templateId === 'design_schema' && (
          <p className="text-sm text-accent">
            Fine-tune the tokens in the form on the left, then submit to write
            DESIGN.md.
          </p>
        )}
      </section>
    </div>
  );
}

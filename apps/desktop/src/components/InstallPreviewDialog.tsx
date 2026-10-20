import type { InstallPreview } from '@awp/protocol';
import { useState } from 'react';
import { Button } from './Button';
import { Chip } from './Chip';
import { Dialog } from './Dialog';

type Props = {
  name: string;
  preview: InstallPreview | null;
  /** Unverified items need an explicit acknowledgement. */
  unverified: boolean;
  error?: string;
  busy: boolean;
  onClose: () => void;
  onInstall: (a: {
    previewId: string;
    confirmScripts: boolean;
    acknowledged: boolean;
  }) => void;
};

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/** Shows every file before install. What is listed here is exactly what gets written. */
export function InstallPreviewDialog({
  name,
  preview,
  unverified,
  error,
  busy,
  onClose,
  onInstall,
}: Props) {
  const [scripts, setScripts] = useState(false);
  const [ack, setAck] = useState(false);
  const ready =
    !!preview &&
    (!preview.needsScriptConfirm || scripts) &&
    (!unverified || ack);

  return (
    <Dialog open={!!preview} onClose={onClose} label={`Review ${name}`} wide>
      {preview && (
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto p-4">
          <h2 className="text-lg font-semibold">Review {name}</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-text-2">Installs into</dt>
            <dd>
              <code className="font-mono">{preview.target}</code>
            </dd>
            <dt className="text-text-2">License</dt>
            <dd>{preview.license}</dd>
            {preview.repo && (
              <>
                <dt className="text-text-2">Source</dt>
                <dd className="break-all font-mono text-xs">
                  {preview.repo.replace('https://', '')}
                  {preview.sha ? ` @ ${preview.sha.slice(0, 7)}` : ''}
                </dd>
              </>
            )}
          </dl>

          <table className="w-full text-sm">
            <caption className="hud pb-1 text-left">
              Files ({preview.files.length})
            </caption>
            <tbody>
              {preview.files.map((f) => (
                <tr key={f.path} className="border-t border-line">
                  <td className="py-1 pr-2 font-mono">{f.path}</td>
                  <td className="py-1 pr-2 text-text-2">{kb(f.size)}</td>
                  <td className="py-1">
                    <span className="flex flex-wrap gap-1">
                      {f.flags.map((x) => (
                        <Chip key={x} tone="warning">
                          {x}
                        </Chip>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="flex flex-col gap-1">
            <h3 className="hud">SKILL.md</h3>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-bg-2 p-2 font-mono text-xs">
              {preview.skillMd}
            </pre>
          </section>

          {preview.scripts.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="hud">Scripts and executables</h3>
              {preview.scripts.map((s) => (
                <details key={s.path} open>
                  <summary className="cursor-pointer font-mono text-sm">
                    Script: {s.path}
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-bg-2 p-2 font-mono text-xs">
                    {s.text || '(binary file: contents not shown)'}
                  </pre>
                </details>
              ))}
            </section>
          )}

          {preview.needsScriptConfirm && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scripts}
                onChange={(e) => setScripts(e.target.checked)}
                className="mt-1"
              />
              I read these scripts and permissions.
            </label>
          )}
          {unverified && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-1"
              />
              I have read the files and license. This item has not been reviewed
              by AWP.
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!ready || busy}
              onClick={() =>
                onInstall({
                  previewId: preview.previewId,
                  confirmScripts: scripts,
                  acknowledged: ack,
                })
              }
            >
              Install
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

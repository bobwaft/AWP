import type { InstallPreview, SuggestionView } from '@awp/protocol';
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Input } from '../components/Input';
import { InstallPreviewDialog } from '../components/InstallPreviewDialog';
import { SuggestionCard } from '../components/SuggestionCard';
import { useToast } from '../components/Toast';
import { engine } from '../lib/engine';
import { useRegistry } from '../lib/registry';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Stage 5: approve, reject and install the skills, MCP servers and tools that fit the project. */
export function ConnectorsView() {
  const { state, error, api } = useRegistry();
  const toast = useToast();
  const [review, setReview] = useState<{
    s: SuggestionView;
    variant?: string;
    preview: InstallPreview | null;
  } | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loadingReview, setLoadingReview] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reviewReq = useRef(0);
  const reviewing = useRef(false);

  const items = state?.items ?? [];
  const idea = (i: SuggestionView) => i.idea && i.status !== 'rejected';
  const todo = items.filter(
    (i) => !i.idea && ['suggested', 'approved', 'failed'].includes(i.status),
  );
  const installed = items.filter((i) => !i.idea && i.status === 'installed');
  const ideas = items.filter(idea);
  const rejected = items.filter((i) => i.status === 'rejected');
  const d = state?.discovery;

  const openReview = async (s: SuggestionView, variant?: string) => {
    if (reviewing.current) return;
    reviewing.current = true;
    const req = ++reviewReq.current;
    setReviewError('');
    setLoadingReview(s.id);
    try {
      const preview = await api.preview(s.id);
      if (req === reviewReq.current) setReview({ s, variant, preview });
    } catch (e) {
      if (req === reviewReq.current)
        toast(`Could not load the files: ${msg(e)}`);
    } finally {
      reviewing.current = false;
      if (req === reviewReq.current) setLoadingReview(null);
    }
  };

  const closeReview = () => {
    reviewReq.current++;
    setReview(null);
  };

  const installFromReview = async (a: {
    previewId: string;
    confirmScripts: boolean;
    acknowledged: boolean;
  }) => {
    if (!review) return;
    setBusy(true);
    setReviewError('');
    try {
      if (review.s.status !== 'approved' && review.s.status !== 'failed')
        await api.decide({
          id: review.s.id,
          decision: 'approve',
          variant: review.variant,
        });
      await api.install({ id: review.s.id, ...a });
      closeReview();
    } catch (e) {
      if ((e as { code?: string }).code === 'PREVIEW_UNKNOWN') {
        // The engine lost the preview (e.g. after a restart): load it again and ask again.
        try {
          const preview = await api.preview(review.s.id);
          setReview({ ...review, preview });
          setReviewError(
            'The files were reloaded. Check them and confirm again.',
          );
        } catch (e2) {
          setReviewError(msg(e2));
        }
      } else setReviewError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    try {
      await engine.call('stage.complete', { stage: 'connectors' });
    } catch (e) {
      toast(msg(e));
    }
  };

  const card = (s: SuggestionView) => (
    <li key={s.id}>
      <SuggestionCard
        s={s}
        api={api}
        onReview={openReview}
        reviewBusy={loadingReview !== null}
        reviewLoading={loadingReview === s.id}
        onTokenSaved={() => void api.refresh()}
        onInstalled={(name, r) => {
          const done =
            r.status === 'recorded'
              ? `${name} recorded in docs/TOOLING.md.`
              : `${name} installed.`;
          toast(r.note ? `${done} ${r.note}` : done);
        }}
      />
    </li>
  );

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Connectors</h1>
          <span className="flex-1" />
          <Button
            disabled={d?.status === 'running' || refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await api.refresh(true);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            Run discovery again
          </Button>
          <Button onClick={() => setAdding(true)}>Add your own…</Button>
        </header>

        {error && (
          <p role="alert" className="text-sm text-danger">
            Could not load suggestions: {error}
          </p>
        )}
        {d?.status === 'running' && (
          <p className="text-sm text-text-2">
            Looking at your specs for tools that fit…
          </p>
        )}
        {d?.status === 'failed' && (
          <p role="alert" className="text-sm text-danger">
            {d.note ?? 'Discovery failed.'}
          </p>
        )}
        {d?.status === 'done' && d.note && (
          <p className="text-sm text-text-2">{d.note}</p>
        )}
        {d?.status === 'done' && items.length === 0 && (
          <p className="text-sm text-text-2">
            Nothing to suggest for this project yet. You can add your own.
          </p>
        )}

        {todo.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="hud">To decide ({todo.length})</h2>
            <ul className="flex flex-col gap-3">{todo.map(card)}</ul>
          </section>
        )}
        {installed.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="hud">Installed ({installed.length})</h2>
            <ul className="flex flex-col gap-3">{installed.map(card)}</ul>
          </section>
        )}
        {ideas.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="hud">Ideas to add yourself ({ideas.length})</h2>
            <ul className="flex flex-col gap-3">{ideas.map(card)}</ul>
          </section>
        )}
        {rejected.length > 0 && (
          <details>
            <summary className="hud cursor-pointer">
              Rejected ({rejected.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-3">{rejected.map(card)}</ul>
          </details>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <p className="flex-1 text-sm text-text-2">
            Approved items are installed into this project. Nothing is required:
            you can finish with none.
          </p>
          <Button variant="primary" onClick={complete}>
            Complete stage
          </Button>
        </div>
      </div>

      <InstallPreviewDialog
        name={review?.s.item.name ?? ''}
        preview={review?.preview ?? null}
        unverified={!!review && !review.s.verified}
        error={reviewError}
        busy={busy}
        onClose={closeReview}
        onInstall={installFromReview}
      />
      <AddCustomDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={async (a) => {
          await api.addCustom(a);
          setAdding(false);
        }}
      />
    </div>
  );
}

function AddCustomDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (a: {
    repoUrl?: string;
    sha?: string;
    path?: string;
    localPath?: string;
  }) => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [path, setPath] = useState('');
  const [sha, setSha] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setUrl('');
    setPath('');
    setSha('');
    setError('');
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };
  const go = async (a: Parameters<typeof onAdd>[0]) => {
    setBusy(true);
    setError('');
    try {
      await onAdd(a);
      reset();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const chooseFolder = async () => {
    const dir = await pickFolder({ directory: true }).catch(() => null);
    if (typeof dir === 'string') await go({ localPath: dir });
  };

  return (
    <Dialog open={open} onClose={close} label="Add your own">
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">Add your own</h2>
        <p className="text-sm text-text-2">
          Add a skill from a GitHub repository or a folder on this computer. AWP
          has not reviewed it: you will read its files and license before it
          installs.
        </p>
        <Input
          label="Repository URL"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          label="Folder in the repository (optional)"
          placeholder="skills/my-skill"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <Input
          label="Commit (optional, default: latest)"
          value={sha}
          onChange={(e) => setSha(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={chooseFolder}>
            Choose a folder on this computer…
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !url.trim()}
            onClick={() =>
              go({
                repoUrl: url.trim(),
                ...(path.trim() ? { path: path.trim() } : {}),
                ...(sha.trim() ? { sha: sha.trim() } : {}),
              })
            }
          >
            Add
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

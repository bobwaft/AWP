import type { SuggestionView } from '@awp/protocol';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import type { RegistryApi } from '../lib/registry';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Input } from './Input';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LICENSE_TONE = {
  ok: 'neutral',
  review: 'warning',
  blocked: 'danger',
} as const;

type Props = {
  s: SuggestionView;
  api: RegistryApi;
  /** Opens the file review for skills. */
  onReview: (s: SuggestionView, variant?: string) => void;
  /** After a token is stored, the engine is asked again what is still missing. */
  onTokenSaved: () => void;
  onInstalled?: (name: string, r: { note?: string }) => void;
};

/** Why it fits, what it costs, where it comes from; Approve and Reject (DESIGN.md §4.2). */
export function SuggestionCard({
  s,
  api,
  onReview,
  onTokenSaved,
  onInstalled,
}: Props) {
  const it = s.item;
  const [variant, setVariant] = useState('');
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const approveAndInstall = () =>
    run(async () => {
      if (s.status !== 'approved' && s.status !== 'failed')
        await api.decide({
          id: s.id,
          decision: 'approve',
          variant: variant || undefined,
        });
      const r = await api.install({ id: s.id });
      onInstalled?.(it.name, r);
    });
  const approveOnly = () =>
    run(() =>
      api.decide({
        id: s.id,
        decision: 'approve',
        variant: variant || undefined,
      }),
    );
  const installNow = () =>
    run(async () => {
      const r = await api.install({ id: s.id });
      onInstalled?.(it.name, r);
    });
  const reject = () => run(() => api.decide({ id: s.id, decision: 'reject' }));
  const undo = () => run(() => api.decide({ id: s.id, decision: 'undo' }));

  const connect = () =>
    run(async () => {
      for (const m of s.missingSecrets) {
        const value = tokens[m.name];
        if (!value) continue;
        const [, service, account] = m.secretKey.split('/');
        await invoke('secret_set', { service, account, value });
      }
      setTokens({});
      onTokenSaved();
    });

  const blocked = s.license.status === 'blocked';
  const needsAccount = s.missingSecrets.length > 0;
  const decided = s.status === 'approved' || s.status === 'failed';
  const isPreview = s.action === 'preview';

  if (s.idea)
    return (
      <Card role="article" aria-label={it.name} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{it.name}</h3>
          <Chip>{s.category ?? 'Idea'}</Chip>
          <Chip tone="warning">Unverified</Chip>
        </div>
        <p className="text-sm">{s.reason}</p>
        <p className="text-xs text-text-2">
          Nothing AWP can install. Add it yourself if you want it.
        </p>
        {s.status !== 'rejected' && (
          <Button
            variant="ghost"
            className="self-start"
            disabled={busy}
            onClick={reject}
          >
            Dismiss
          </Button>
        )}
      </Card>
    );

  return (
    <Card role="article" aria-label={it.name} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{it.name}</h3>
        <Chip>{it.kind}</Chip>
        <Chip tone={s.verified ? 'success' : 'warning'}>
          {s.verified ? 'Verified' : 'Unverified'}
        </Chip>
        <Chip tone={LICENSE_TONE[s.license.status]}>
          License: {s.license.note}
        </Chip>
        {it.flags.telemetry && <Chip tone="warning">Sends telemetry</Chip>}
        {it.flags.writes && (
          <Chip tone="warning">Can change things in your accounts</Chip>
        )}
        {s.status === 'installed' && <Chip tone="success">Installed</Chip>}
      </div>

      <p className="text-sm">{s.reason}</p>
      <p className="text-sm text-text-2">{it.summary}</p>
      {it.flags.cost && (
        <p className="text-sm text-text-2">Cost: {it.flags.cost}</p>
      )}
      {s.notPinned && (
        <p className="text-sm text-warning">
          Not pinned: Claude Code installs the latest version of this plugin.
        </p>
      )}

      {s.command && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-text-2">
            {s.action === 'installer'
              ? 'AWP will run this on your computer:'
              : s.action === 'doc'
                ? 'You run this yourself:'
                : 'Command:'}
          </p>
          <code className="overflow-x-auto rounded-sm bg-bg-2 px-2 py-1 font-mono text-xs">
            {s.command}
          </code>
        </div>
      )}

      {it.variants.length > 0 && s.status !== 'installed' && (
        <fieldset className="flex flex-col gap-1 text-sm" disabled={busy}>
          <legend className="text-text-2">How much access?</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`v-${s.id}`}
              checked={variant === ''}
              onChange={() => setVariant('')}
            />
            Default
          </label>
          {it.variants.map((v) => (
            <label key={v.id} className="flex items-center gap-2">
              <input
                type="radio"
                name={`v-${s.id}`}
                checked={variant === v.id}
                onChange={() => setVariant(v.id)}
              />
              {v.label}
              {v.safe ? ' (safer)' : ''}
            </label>
          ))}
        </fieldset>
      )}

      {needsAccount && s.status !== 'installed' && (
        <div className="flex flex-col gap-2 rounded-sm border border-line p-3">
          <p className="text-sm text-text-2">
            Connect your account first. The token goes to your computer's
            keychain and is never shown again.
          </p>
          {s.missingSecrets.map((m) => (
            <div key={m.name} className="flex flex-col gap-1">
              <Input
                label={m.name}
                type="password"
                autoComplete="off"
                value={tokens[m.name] ?? ''}
                onChange={(e) =>
                  setTokens((t) => ({ ...t, [m.name]: e.target.value }))
                }
              />
              {m.help && <p className="text-xs text-text-2">{m.help}</p>}
            </div>
          ))}
          <Button
            className="self-start"
            disabled={busy || !Object.values(tokens).some(Boolean)}
            onClick={connect}
          >
            Connect account
          </Button>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-text-2">Details</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {it.source.repo && (
            <li>
              Source:{' '}
              <span className="font-mono">
                {it.source.repo.replace('https://', '')}
              </span>
              {it.source.sha ? ` @ ${it.source.sha.slice(0, 7)}` : ''}
            </li>
          )}
          {it.flags.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {it.neverStages.length > 0 && (
            <li>
              Used in build phases only, not in {it.neverStages.join(', ')}.
            </li>
          )}
          {s.alternatives.length > 0 && (
            <li>Other options in this group: {s.alternatives.join(', ')}.</li>
          )}
        </ul>
      </details>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {s.status === 'failed' && s.error && !error && (
        <p role="alert" className="text-sm text-danger">
          Could not install: {s.error}
        </p>
      )}

      {s.status !== 'installed' && s.status !== 'rejected' && (
        <div className="flex flex-wrap items-center gap-2">
          {isPreview ? (
            <Button
              variant="primary"
              disabled={busy || blocked}
              onClick={() => onReview(s, variant || undefined)}
            >
              Review files
            </Button>
          ) : s.status === 'failed' ? (
            <Button variant="primary" disabled={busy} onClick={installNow}>
              Retry
            </Button>
          ) : s.action === 'doc' ? (
            <Button
              variant="primary"
              disabled={busy || blocked || decided}
              onClick={approveOnly}
            >
              Approve
            </Button>
          ) : decided ? (
            <Button
              variant="primary"
              disabled={busy || needsAccount}
              onClick={installNow}
            >
              Install
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy || blocked || needsAccount}
              onClick={approveAndInstall}
            >
              Approve and install
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={reject}>
            Reject
          </Button>
        </div>
      )}
      {s.status === 'rejected' && (
        <Button className="self-start" disabled={busy} onClick={undo}>
          Undo
        </Button>
      )}
    </Card>
  );
}

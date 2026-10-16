import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';

/** Token entry. Values go straight to the OS keychain and are never shown again. */
export function AccountsCard({ githubAccount }: { githubAccount?: string }) {
  const [names, setNames] = useState<string[]>([]);
  const [service, setService] = useState('figma');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(
    () =>
      invoke<string[]>('accounts_list')
        .then(setNames)
        .catch(() => setNames([])),
    [],
  );
  useEffect(() => void refresh(), [refresh]);

  const save = async () => {
    setError('');
    try {
      await invoke('secret_set', {
        service: service.trim(),
        account: 'default',
        value: token,
      });
      setToken('');
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };
  const remove = async (name: string) => {
    const [, svc, acct] = name.split('/');
    await invoke('secret_delete', { service: svc, account: acct });
    await refresh();
  };

  return (
    <Card className="flex flex-col gap-3" aria-label="Accounts">
      <h3 className="font-medium">Accounts</h3>
      <p className="text-sm text-text-2">
        GitHub:{' '}
        {githubAccount
          ? `connected as ${githubAccount}`
          : 'not connected (sign in with the GitHub CLI above)'}
      </p>
      <ul className="flex flex-col gap-1">
        {names.map((n) => (
          <li key={n} className="flex items-center gap-2 text-sm">
            <span className="font-mono">{n.split('/')[1]}</span>
            <span className="text-text-2">token saved</span>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => remove(n)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <Input
            label="Service (e.g. figma)"
            className="w-full min-w-0"
            value={service}
            onChange={(e) => setService(e.target.value)}
          />
        </div>
        <div className="min-w-32 flex-1">
          <Input
            label="Token"
            type="password"
            autoComplete="off"
            className="w-full min-w-0"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          disabled={!service.trim() || !token}
          onClick={save}
        >
          Save token
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

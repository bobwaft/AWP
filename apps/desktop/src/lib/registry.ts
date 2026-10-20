import type {
  InstallPreview,
  InstallResult,
  SuggestionsState,
} from '@awp/protocol';
import { useCallback, useEffect, useState } from 'react';
import { engine } from './engine';

export type RegistryApi = ReturnType<typeof useRegistry>['api'];

/** Live view of the Connectors suggestions: the engine owns the state, this mirrors it. */
export function useRegistry() {
  const [state, setState] = useState<SuggestionsState | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async (refresh = false) => {
    try {
      setState(
        await engine.call('registry.suggest', refresh ? { refresh: true } : {}),
      );
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    return engine.on((e) => {
      if (e.method === 'registry.state') setState(e.params as SuggestionsState);
    });
  }, [load]);

  const api = {
    refresh: load,
    decide: async (a: {
      id: string;
      decision: 'approve' | 'reject' | 'undo';
      reason?: string;
      variant?: string;
    }) => {
      setState(await engine.call('registry.decide', a));
    },
    preview: (id: string): Promise<InstallPreview> =>
      engine.call('registry.preview', { id }),
    install: async (a: {
      id: string;
      previewId?: string;
      confirmScripts?: boolean;
      acknowledged?: boolean;
    }): Promise<InstallResult> => {
      const r = await engine.call('registry.install', a);
      setState(r.state);
      return r.result;
    },
    addCustom: async (a: {
      repoUrl?: string;
      sha?: string;
      path?: string;
      localPath?: string;
    }) => {
      setState(await engine.call('registry.addCustom', a));
    },
  };
  return { state, error, api };
}

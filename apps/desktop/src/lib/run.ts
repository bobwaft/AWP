import type { AgentEvent } from '@awp/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { engine } from './engine';

export type RunState = {
  events: AgentEvent[];
  running: boolean;
  model?: string;
};

/** Live state of one agent run, driven by `run.event` notifications. */
export function useRun() {
  const [state, setState] = useState<RunState>({ events: [], running: false });
  const runId = useRef<string | null>(null);
  const stopWanted = useRef(false);
  const pending = useRef<{ runId: string; event: AgentEvent }[]>([]);

  const apply = useCallback((event: AgentEvent) => {
    setState((s) => ({
      events: [...s.events, event],
      running: event.type === 'done' ? false : s.running,
      model: event.type === 'session' ? (event.model ?? s.model) : s.model,
    }));
  }, []);

  useEffect(
    () =>
      engine.on((e) => {
        if (e.method !== 'run.event') return;
        const p = e.params as { runId: string; event: AgentEvent };
        // Events can arrive before agent.run resolves with the id; buffer them.
        if (runId.current === null) pending.current.push(p);
        else if (p.runId === runId.current) apply(p.event);
      }),
    [apply],
  );

  const start = useCallback(
    async (input: {
      prompt: string;
      cwd: string;
      adapter: 'claude' | 'fake';
      fixture?: string;
      model?: string;
    }) => {
      runId.current = null;
      pending.current = [];
      stopWanted.current = false;
      setState({ events: [], running: true });
      try {
        const r = await engine.call('agent.run', input);
        runId.current = r.runId;
        for (const p of pending.current)
          if (p.runId === r.runId) apply(p.event);
        pending.current = [];
        // Stop was pressed before the id arrived: honour it now.
        if (stopWanted.current)
          await engine.call('agent.stop', { runId: r.runId }).catch(() => {});
      } catch (e) {
        apply({
          type: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
        apply({ type: 'done', status: 'error' });
      }
    },
    [apply],
  );

  const stop = useCallback(async () => {
    if (runId.current)
      await engine.call('agent.stop', { runId: runId.current }).catch(() => {});
    else stopWanted.current = true;
  }, []);

  return { ...state, start, stop };
}

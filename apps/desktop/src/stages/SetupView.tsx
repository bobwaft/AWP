import {
  fixFor,
  type SetupDetectResult,
  setupReady,
  type ToolId,
} from '@awp/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountsCard } from '../components/AccountsCard';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { type CardState, SetupCard } from '../components/SetupCard';
import { TerminalPanel } from '../components/TerminalDrawer';
import { engine } from '../lib/engine';
import { currentOs } from '../lib/os';
import { useTerminal } from '../lib/terminal';

const REQUIRED: [ToolId, string][] = [
  ['git', 'Git'],
  ['claude', 'Claude Code'],
];
const OPTIONAL: [ToolId, string][] = [
  ['gh', 'GitHub CLI'],
  ['semgrep', 'Semgrep'],
];

export function SetupView({ onContinue }: { onContinue: () => void }) {
  const term = useTerminal();
  const os = currentOs();
  const [result, setResult] = useState<SetupDetectResult>();
  const [waiting, setWaiting] = useState<Set<ToolId>>(new Set());
  const [failed, setFailed] = useState<Set<ToolId>>(new Set());
  const [error, setError] = useState<string>();
  const tabTool = useRef(new Map<string, ToolId>());

  const check = useCallback(async () => {
    try {
      const r = await engine.call('setup.detect');
      setResult(r);
      setError(undefined);
      setWaiting((w) => new Set([...w].filter((t) => r[t].state !== 'ready')));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => void check(), [check]);
  // A restarted engine: detect again.
  useEffect(
    () =>
      engine.on((e) => {
        if (e.method === 'engine.restarted') void check();
      }),
    [check],
  );
  useEffect(() => {
    term.setInline(true);
    return () => term.setInline(false);
  }, [term.setInline]);

  // Poll every 3 s while a fix is open (covers logins that never exit).
  useEffect(() => {
    if (waiting.size === 0) return;
    const t = setInterval(check, 3000);
    return () => clearInterval(t);
  }, [waiting.size, check]);

  // Re-check when a fix command exits; non-zero shows the failure hint.
  useEffect(
    () =>
      term.onExit((tab, code) => {
        const tool = tabTool.current.get(tab.id);
        if (tool && code !== 0) setFailed((f) => new Set(f).add(tool));
        void check();
      }),
    [term.onExit, check],
  );

  const fix = async (tool: ToolId) => {
    const state = result?.[tool].state ?? 'missing';
    const f = fixFor(tool, state, os);
    if (!f) return;
    setFailed((s) => new Set([...s].filter((t) => t !== tool)));
    const id = await term.open({ title: f.title, prefill: f.command });
    if (id) tabTool.current.set(id, tool);
    setWaiting((w) => new Set(w).add(tool));
  };

  const card = ([tool, name]: [ToolId, string]) => {
    const s = result?.[tool];
    const state: CardState =
      waiting.has(tool) && s?.state !== 'ready'
        ? 'waiting'
        : (s?.state ?? 'checking');
    return (
      <SetupCard
        key={tool}
        name={name}
        state={state}
        status={s}
        fix={s ? fixFor(tool, s.state, os) : undefined}
        failedExit={failed.has(tool)}
        onFix={() => fix(tool)}
        onRecheck={check}
      />
    );
  };

  const ready = result ? setupReady(result) : false;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[28rem] shrink-0 flex-col gap-4 overflow-auto p-6">
        <h1 className="text-xl font-semibold">Setup</h1>
        {error && !result && (
          <Card role="alert" className="flex flex-col gap-2">
            <p className="text-sm text-danger">
              Couldn't check your tools: {error}
            </p>
            <Button className="self-start" onClick={() => void check()}>
              Retry
            </Button>
          </Card>
        )}
        <h2 className="hud">Required</h2>
        {REQUIRED.map(card)}
        <details>
          <summary className="hud cursor-pointer">
            Optional · not needed yet
          </summary>
          <div className="mt-2 flex flex-col gap-3">{OPTIONAL.map(card)}</div>
        </details>
        <AccountsCard githubAccount={result?.gh.account} />
        <Button variant="primary" disabled={!ready} onClick={onContinue}>
          Continue to Ideation
        </Button>
      </div>
      <div className="min-w-0 flex-1 border-l border-line">
        <TerminalPanel />
      </div>
    </div>
  );
}

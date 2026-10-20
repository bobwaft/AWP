import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { engine } from './engine';

export type Tab = { id: string; title: string; exitCode?: number };
export type OpenOpts = {
  title: string;
  cwd?: string;
  program?: string;
  /** Typed at the prompt without Enter (AWP's fix list only). */
  prefill?: string;
  /** Also press Enter: only for an owner-verified Connectors command the user just approved. */
  run?: boolean;
};

type Term = {
  tabs: Tab[];
  active?: string;
  open: (o: OpenOpts) => Promise<string | undefined>;
  close: (id: string) => void;
  setActive: (id: string) => void;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  /** Replays buffered output, then streams. Returns unsubscribe. */
  attach: (id: string, onData: (s: string) => void) => () => void;
  onExit: (cb: (tab: Tab, code: number) => void) => () => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  /** Setup shows the terminal inline, so the drawer hides itself. */
  inline: boolean;
  setInline: (v: boolean) => void;
};

const Ctx = createContext<Term | null>(null);
export const useTerminal = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTerminal outside TerminalProvider');
  return c;
};

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [inline, setInline] = useState(false);
  const buffers = useRef(new Map<string, string[]>());
  const subs = useRef(new Map<string, Set<(s: string) => void>>());
  const exitCbs = useRef(new Set<(tab: Tab, code: number) => void>());
  const tabsRef = useRef<Tab[]>([]);
  tabsRef.current = tabs;

  const open = useCallback(async (o: OpenOpts) => {
    let env: Record<string, string> = {};
    try {
      env = await engine.call('setup.freshEnv');
    } catch {}
    let id: string;
    try {
      id = await invoke<string>('pty_spawn', {
        opts: { cwd: o.cwd, program: o.program, cols: 80, rows: 24, env },
      });
    } catch {
      return undefined;
    }
    const tab: Tab = { id, title: o.title };
    buffers.current.set(id, []);
    await listen<string>(`pty://data/${id}`, ({ payload }) => {
      buffers.current.get(id)?.push(payload);
      subs.current.get(id)?.forEach((f) => {
        f(payload);
      });
    });
    await listen<number>(`pty://exit/${id}`, ({ payload }) => {
      setTabs((ts) =>
        ts.map((t) => (t.id === id ? { ...t, exitCode: payload } : t)),
      );
      exitCbs.current.forEach((cb) => {
        cb(tab, payload);
      });
    });
    setTabs((ts) => [...ts, tab]);
    setActive(id);
    setExpanded(true);
    if (o.prefill)
      await invoke('pty_write', {
        ptyId: id,
        data: o.run ? `${o.prefill}\r` : o.prefill,
      });
    return id;
  }, []);

  const close = useCallback((id: string) => {
    void invoke('pty_kill', { ptyId: id });
    buffers.current.delete(id);
    setTabs((ts) => ts.filter((t) => t.id !== id));
    setActive((a) =>
      a === id ? tabsRef.current.find((t) => t.id !== id)?.id : a,
    );
  }, []);

  const value = useMemo<Term>(
    () => ({
      tabs,
      active,
      open,
      close,
      setActive,
      write: (id, data) => void invoke('pty_write', { ptyId: id, data }),
      resize: (id, cols, rows) =>
        void invoke('pty_resize', { ptyId: id, cols, rows }),
      attach: (id, onData) => {
        for (const chunk of buffers.current.get(id) ?? []) onData(chunk);
        const set = subs.current.get(id) ?? new Set();
        set.add(onData);
        subs.current.set(id, set);
        return () => set.delete(onData);
      },
      onExit: (cb) => {
        exitCbs.current.add(cb);
        return () => exitCbs.current.delete(cb);
      },
      expanded,
      setExpanded,
      inline,
      setInline,
    }),
    [tabs, active, open, close, expanded, inline],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setExpanded((x) => !x);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

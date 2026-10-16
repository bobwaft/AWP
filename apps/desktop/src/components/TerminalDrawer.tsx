import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../lib/terminal';
import { Button } from './Button';

// ANSI sets derived for the opaque --bg-1 terminal surface (dark/light).
const ANSI = {
  dark: [
    '#6b7280',
    '#ff7b72',
    '#7ee787',
    '#e3b341',
    '#79c0ff',
    '#d2a8ff',
    '#56d4dd',
    '#d0d7de',
    '#8b949e',
    '#ffa198',
    '#9be9a8',
    '#f2cc60',
    '#a5d6ff',
    '#e2c5ff',
    '#7ee8f0',
    '#ffffff',
  ],
  light: [
    '#24292f',
    '#a40e26',
    '#116329',
    '#7a5900',
    '#0550ae',
    '#6639ba',
    '#1b7c83',
    '#57606a',
    '#4b535d',
    '#82071e',
    '#0f5323',
    '#633c01',
    '#033d8b',
    '#512a97',
    '#136061',
    '#1f2328',
  ],
};

function TerminalView({ id, visible }: { id: string; visible: boolean }) {
  const term = useTerminal();
  const host = useRef<HTMLDivElement>(null);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const css = getComputedStyle(document.documentElement);
    const dark = document.documentElement.dataset.theme !== 'light';
    const palette = dark ? ANSI.dark : ANSI.light;
    const names = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
    ] as const;
    const t = new Terminal({
      fontFamily: 'Geist Mono, monospace',
      fontSize: 13,
      lineHeight: 18 / 13,
      cursorBlink: true,
      theme: {
        background: css.getPropertyValue('--bg-1').trim() || '#111',
        foreground: css.getPropertyValue('--text-1').trim() || '#eee',
        ...Object.fromEntries(names.map((n, i) => [n, palette[i]])),
        ...Object.fromEntries(
          names.map((n, i) => [
            `bright${n[0].toUpperCase()}${n.slice(1)}`,
            palette[i + 8],
          ]),
        ),
      },
    });
    const f = new FitAddon();
    fit.current = f;
    t.loadAddon(f);
    t.open(host.current);
    const detach = term.attach(id, (s) => t.write(s));
    const sub = t.onData((d) => term.write(id, d));
    const ro = new ResizeObserver(() => {
      if (!host.current?.offsetWidth) return;
      f.fit();
      term.resize(id, t.cols, t.rows);
    });
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      sub.dispose();
      detach();
      t.dispose();
    };
  }, [id, term.attach, term.write, term.resize]);

  return (
    <div ref={host} className={`h-full w-full ${visible ? '' : 'hidden'}`} />
  );
}

/** Tabs + terminal surface; used by the drawer and the inline Setup panel. */
export function TerminalPanel() {
  const term = useTerminal();
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-1">
      <div
        role="tablist"
        className="flex items-center gap-1 border-b border-line px-2"
      >
        {term.tabs.map((t) => (
          <div key={t.id} className="flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={term.active === t.id}
              onClick={() => term.setActive(t.id)}
              className={`min-h-7 px-2 text-sm ${term.active === t.id ? 'text-text-1' : 'text-text-2'}`}
            >
              {t.title}
              {t.exitCode !== undefined && ` (exit ${t.exitCode})`}
            </button>
            <button
              type="button"
              aria-label={`Close ${t.title}`}
              onClick={() => term.close(t.id)}
              className="text-text-2"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          aria-label="New terminal"
          onClick={() => term.open({ title: 'Shell' })}
        >
          <Plus size={14} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          onClick={() => term.open({ title: 'Claude Code', program: 'claude' })}
        >
          Open Claude Code here
        </Button>
      </div>
      <div className="min-h-0 flex-1 p-1">
        {term.tabs.map((t) => (
          <TerminalView key={t.id} id={t.id} visible={term.active === t.id} />
        ))}
        {term.tabs.length === 0 && (
          <p className="p-3 text-text-2">No terminals open.</p>
        )}
      </div>
    </div>
  );
}

export function TerminalDrawer() {
  const term = useTerminal();
  const [height, setHeight] = useState(280);
  if (term.inline) return null;

  const startDrag = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) =>
      setHeight(
        Math.min(
          window.innerHeight * 0.7,
          Math.max(160, startH + startY - ev.clientY),
        ),
      );
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section
      aria-label="Terminal"
      className="shrink-0 border-t border-line bg-bg-1"
      style={{ height: term.expanded ? height : 28 }}
    >
      {term.expanded && (
        <div
          aria-hidden
          onPointerDown={startDrag}
          className="h-1 cursor-row-resize bg-line"
        />
      )}
      <button
        type="button"
        onClick={() => term.setExpanded(!term.expanded)}
        aria-expanded={term.expanded}
        className={`hud flex w-full items-center px-3 ${term.expanded ? 'h-7' : 'h-full'}`}
      >
        TERMINAL · {term.tabs.length} {term.tabs.length === 1 ? 'tab' : 'tabs'}
      </button>
      {/* Stay mounted while collapsed so shells and scrollback survive. */}
      <div className={term.expanded ? 'h-[calc(100%-2.25rem)]' : 'hidden'}>
        <TerminalPanel />
      </div>
    </section>
  );
}

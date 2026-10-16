import { STAGE_IDS } from '@awp/protocol';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { RifleDiagram2D } from './components/RifleDiagram2D';
import { SettingsScreen } from './components/SettingsScreen';
import { StageRail } from './components/StageRail';
import { TerminalDrawer } from './components/TerminalDrawer';
import { ToastProvider, useToast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { engine } from './lib/engine';
import { ProjectProvider, useProject } from './lib/project';
import { loadSettings, saveSettings } from './lib/settings';
import { STAGES, stageForKey } from './lib/stages';
import { TerminalProvider } from './lib/terminal';
import { applyTheme } from './lib/theme';
import { Dashboard } from './stages/Dashboard';
import { DesignView } from './stages/DesignView';
import { DevRun } from './stages/DevRun';
import { IdeationView } from './stages/IdeationView';
import { PlanningView } from './stages/PlanningView';
import { SetupView } from './stages/SetupView';

type View = 'home' | 'settings' | 'dev';

// Surfaces engine supervisor/toast notifications as UI toasts.
function EngineToasts() {
  const toast = useToast();
  useEffect(
    () =>
      engine.on((e) => {
        if (e.method === 'engine.restarted')
          toast('Engine crashed and was restarted.');
        else if (e.method === 'engine.failed')
          toast(
            `Engine stopped: ${(e.params as { reason: string }).reason}. Restart AWP.`,
          );
        else if (e.method === 'toast')
          toast((e.params as { text: string }).text);
      }),
    [toast],
  );
  return null;
}

function Shell() {
  const { project, setupDone, setSetupDone, enter } = useProject();
  const [settings, setSettings] = useState(loadSettings);
  const [stage, setStage] = useState(1);
  const [view, setView] = useState<View>('home');
  const [palette, setPalette] = useState(false);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  useEffect(() => saveSettings(settings), [settings]);

  const goStage = useCallback(
    (n: number) => {
      setStage(n);
      setView('home');
      void enter(STAGE_IDS[n - 1]); // persisted so a restart lands here
    },
    [enter],
  );

  // Land on the project's saved stage when a project is opened.
  const projectPath = project?.project.path;
  const savedStage = project ? STAGE_IDS.indexOf(project.current) + 1 : 1;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on open/close of a project
  useEffect(() => {
    if (projectPath) {
      setStage(savedStage);
      setView('home');
    }
  }, [projectPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,textarea,select,[contenteditable],[role=dialog]',
          ))
      )
        return;
      const n = stageForKey(e.key);
      if (n) goStage(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goStage]);

  const commands = useMemo(
    () => [
      ...STAGES.map((s) => ({
        id: `stage-${s.n}`,
        label: `Go to stage ${s.n}: ${s.label}`,
        run: () => goStage(s.n),
      })),
      {
        id: 'settings',
        label: 'Open settings',
        run: () => setView('settings'),
      },
      {
        id: 'dev-run',
        label: 'Dev: run prompt',
        run: () => setView('dev'),
      },
    ],
    [goStage],
  );

  const current = STAGES[stage - 1];
  return (
    <ToastProvider>
      <TerminalProvider>
        <EngineToasts />
        <div className="flex h-full flex-col">
          <TopBar
            onOpenPalette={() => setPalette(true)}
            onOpenSettings={() => setView('settings')}
          />
          <div className="flex min-h-0 flex-1">
            <StageRail selected={stage} onSelect={goStage} />
            <main className="flex-1 overflow-auto">
              {view === 'dev' ? (
                <DevRun />
              ) : view === 'settings' ? (
                <SettingsScreen settings={settings} onChange={setSettings} />
              ) : stage === 1 && (project || !setupDone) ? (
                <SetupView
                  onContinue={() => {
                    setSetupDone(true);
                    if (project) goStage(Math.max(2, savedStage));
                  }}
                />
              ) : !project ? (
                <Dashboard onRerunSetup={() => setSetupDone(false)} />
              ) : stage === 2 ? (
                <IdeationView />
              ) : stage === 3 ? (
                <DesignView />
              ) : stage === 4 ? (
                <PlanningView />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
                  <p className="hud">
                    Stage {String(stage).padStart(2, '0')} · {current.label}
                  </p>
                  <RifleDiagram2D selected={stage} onSelect={goStage} />
                </div>
              )}
            </main>
            <aside
              aria-label="Details"
              className="hidden w-0 shrink-0 border-l border-line bg-bg-1"
            />
          </div>
          <TerminalDrawer />
        </div>
        <CommandPalette
          open={palette}
          onClose={() => setPalette(false)}
          commands={commands}
        />
      </TerminalProvider>
    </ToastProvider>
  );
}

export function App() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  );
}

import {
  type ProjectState,
  type ProjectSummary,
  STAGE_IDS,
  type StageId,
} from '@awp/protocol';
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
import type { StageState } from './stages';

type Ctx = {
  project: ProjectState | null;
  recents: ProjectSummary[];
  /** Message of the last failed `project.list`, or null. */
  listError: string | null;
  setupDone: boolean;
  setSetupDone: (v: boolean) => void;
  /** Rail/diagram state for stage number 1..10. */
  stateOf: (n: number) => StageState;
  open: (path: string) => Promise<void>;
  create: (path: string, name: string) => Promise<void>;
  enter: (stage: StageId) => Promise<void>;
  refresh: () => Promise<void>;
};

const Project = createContext<Ctx | null>(null);
export const useProject = () => {
  const c = useContext(Project);
  if (!c) throw new Error('useProject outside ProjectProvider');
  return c;
};

const DONE_KEY = 'awp.setupDone';
const readDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
};

const MAP: Record<ProjectState['stages'][StageId]['status'], StageState> = {
  locked: 'locked',
  active: 'current',
  complete: 'done',
  stale: 'stale',
};

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [recents, setRecents] = useState<ProjectSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [setupDone, setDone] = useState(readDone);
  const openPath = useRef<string | undefined>(undefined);
  openPath.current = project?.project?.path;

  const setSetupDone = useCallback((v: boolean) => {
    setDone(v);
    try {
      localStorage.setItem(DONE_KEY, v ? '1' : '0');
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRecents(await engine.call('project.list'));
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // On launch, reopen the most recent project so the user lands on the same stage.
  useEffect(() => {
    void (async () => {
      try {
        const list = await engine.call('project.list');
        setRecents(list);
        setListError(null);
        const last = list.find((p) => !p.missing);
        if (last)
          setProject(await engine.call('project.open', { path: last.path }));
      } catch (e) {
        setListError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(
    () =>
      engine.on((e) => {
        if (e.method === 'state.changed') setProject(e.params as ProjectState);
        // A restarted engine has no open project: reload the list and reopen.
        else if (e.method === 'engine.restarted')
          void (async () => {
            await refresh();
            const path = openPath.current;
            if (!path) return;
            try {
              setProject(await engine.call('project.open', { path }));
            } catch {}
          })();
      }),
    [refresh],
  );

  const open = useCallback(
    async (path: string) => {
      setProject(await engine.call('project.open', { path }));
      setSetupDone(true);
      void refresh();
    },
    [refresh, setSetupDone],
  );
  const create = useCallback(
    async (path: string, name: string) => {
      setProject(await engine.call('project.create', { path, name }));
      setSetupDone(true);
      void refresh();
    },
    [refresh, setSetupDone],
  );
  const enter = useCallback(async (stage: StageId) => {
    try {
      setProject(await engine.call('stage.enter', { stage }));
    } catch {} // locked stages are view-only
  }, []);

  const stateOf = useCallback(
    (n: number): StageState => {
      const id = STAGE_IDS[n - 1];
      if (project) return MAP[project.stages[id].status];
      if (n === 1) return setupDone ? 'done' : 'current';
      return 'locked';
    },
    [project, setupDone],
  );

  const value = useMemo(
    () => ({
      project,
      recents,
      listError,
      setupDone,
      setSetupDone,
      stateOf,
      open,
      create,
      enter,
      refresh,
    }),
    [
      project,
      recents,
      listError,
      setupDone,
      setSetupDone,
      stateOf,
      open,
      create,
      enter,
      refresh,
    ],
  );
  return <Project.Provider value={value}>{children}</Project.Provider>;
}

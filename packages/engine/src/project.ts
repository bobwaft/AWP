import { type FSWatcher, watch } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  type ProjectState,
  ProjectState as ProjectStateSchema,
  type ProjectSummary,
  STAGE_IDS,
  type StageId,
} from '@awp/protocol';
import { EngineError } from './errors';
import { BUILD_BRANCH, gitService } from './git';
import * as orch from './orchestrator';
import type { Notify } from './runs';

const stateFile = (root: string) => join(root, '.awp', 'state.json');

async function exists(p: string) {
  return stat(p).then(
    () => true,
    () => false,
  );
}

export function claudeMd(name: string) {
  return `# ${name}

This project is built with AWP. The specs are the source of truth:

- docs/PRD.md: what and why
- docs/DESIGN.md: look and feel (tokens in docs/design/tokens.json)
- docs/ARCHITECTURE.md: stack, structure, verify commands
- docs/PHASES.md: build order

## Rules
- Work on one phase at a time, in order.
- Do not guess. If a spec is ambiguous, ask.
- Record decisions and gotchas in MEMORY.md; log bugs in BUGS.md.
- Keep secrets out of the repo. Never commit .env files.
`;
}

const BUGS_MD = `# BUGS

Each entry: ID (BUG-001...), phase, steps, expected, actual, severity, and a \`- Status: open|fixed\` line.
`;

/** Writes the project layout (ARCHITECTURE.md section 5), inits git, commits, and branches. */
export async function scaffoldProject(
  root: string,
  name: string,
): Promise<ProjectState> {
  if (await exists(stateFile(root)))
    throw new EngineError(
      'PROJECT_EXISTS',
      'This folder is already an AWP project',
    );
  const state = orch.initialState(name, root);
  await mkdir(join(root, 'docs', 'design'), { recursive: true });
  await mkdir(join(root, '.awp'), { recursive: true });
  const files: Record<string, string> = {
    'CLAUDE.md': claudeMd(name),
    'MEMORY.md': '# MEMORY\n',
    'BUGS.md': BUGS_MD,
    '.gitignore': '.awp/runs/\n.env\n.env.*\nnode_modules/\n',
    'docs/.gitkeep': '',
    'docs/design/.gitkeep': '',
  };
  for (const [f, body] of Object.entries(files))
    await writeFile(join(root, f), body, { flag: 'wx' }).catch((e) => {
      if (e.code !== 'EEXIST') throw e; // keep a pre-existing file
    });
  await writeState(root, state);
  if (!(await exists(join(root, '.git')))) await gitService.init(root);
  await gitService.commitAll(root, 'awp: initial project');
  await gitService.checkoutNew(root, BUILD_BRANCH).catch(() => {}); // already exists on re-scaffold
  return state;
}

export async function writeState(root: string, state: ProjectState) {
  const file = stateFile(root);
  await mkdir(join(root, '.awp'), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, file); // atomic: a crash never leaves half a file
}

export async function readState(root: string): Promise<ProjectState> {
  let raw: string;
  try {
    raw = await readFile(stateFile(root), 'utf8');
  } catch {
    throw new EngineError('PROJECT_NOT_FOUND', 'No AWP project in that folder');
  }
  const parsed = ProjectStateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new EngineError(
      'STATE_INVALID',
      '.awp/state.json is not valid',
      'Restore it from git.',
    );
  return { ...parsed.data, project: { ...parsed.data.project, path: root } };
}

export async function countOpenBugs(root: string) {
  const text = await readFile(join(root, 'BUGS.md'), 'utf8').catch(() => '');
  return (text.match(/^- Status:\s*open/gim) ?? []).length;
}

type Recent = { path: string; name: string };

export class ProjectService {
  private root?: string;
  private state?: ProjectState;
  private watcher?: FSWatcher;
  private debounce = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private dataDir: string,
    private notify: Notify,
  ) {}

  private get recentsFile() {
    return join(this.dataDir, 'projects.json');
  }

  private async recents(): Promise<Recent[]> {
    try {
      return JSON.parse(await readFile(this.recentsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  private async remember(r: Recent) {
    const list = [
      r,
      ...(await this.recents()).filter((x) => x.path !== r.path),
    ].slice(0, 20);
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.recentsFile, JSON.stringify(list, null, 2));
  }

  async create(path: string, name: string) {
    const root = resolve(path);
    const state = await scaffoldProject(root, name);
    return this.activate(root, state);
  }

  async open(path: string) {
    const root = resolve(path);
    return this.activate(root, await readState(root));
  }

  private async activate(root: string, state: ProjectState) {
    this.watcher?.close();
    this.root = root;
    this.state = state;
    await this.remember({ path: root, name: state.project.name });
    this.watchSpecs(root);
    return state;
  }

  async list(): Promise<ProjectSummary[]> {
    return Promise.all(
      (await this.recents()).map(async (r): Promise<ProjectSummary> => {
        try {
          const s = await readState(r.path);
          const stage =
            STAGE_IDS.find((id) => s.stages[id].status === 'active') ??
            s.current;
          return {
            path: r.path,
            name: s.project.name,
            stage,
            phasesPassed: s.phases.filter((p) => p.status === 'passed').length,
            phasesTotal: s.phases.length,
            lastActivity: s.updatedAt,
            openBugs: await countOpenBugs(r.path),
            missing: false,
          };
        } catch {
          return {
            path: r.path,
            name: r.name || basename(r.path),
            phasesPassed: 0,
            phasesTotal: 0,
            openBugs: 0,
            missing: true,
          };
        }
      }),
    );
  }

  /** Applies a pure transition, persists, and broadcasts. */
  async mutate(fn: (s: ProjectState) => ProjectState) {
    if (!this.root || !this.state)
      throw new EngineError('NO_PROJECT', 'No project is open');
    const next = fn(this.state);
    if (next === this.state) return next;
    next.updatedAt = new Date().toISOString();
    await writeState(this.root, next);
    this.state = next;
    this.notify('state.changed', next);
    return next;
  }

  enter = (stage: StageId) => this.mutate((s) => orch.enterStage(s, stage));
  complete = (stage: StageId, reason?: string) =>
    this.mutate((s) => orch.completeStage(s, stage, reason));
  reopen = (stage: StageId) => this.mutate((s) => orch.reopenStage(s, stage));

  private watchSpecs(root: string) {
    const docs = join(root, 'docs');
    try {
      this.watcher = watch(docs, { recursive: true }, (_ev, file) => {
        if (!file) return;
        const rel = `docs/${String(file).replace(/\\/g, '/')}`;
        clearTimeout(this.debounce.get(rel));
        this.debounce.set(
          rel,
          setTimeout(() => {
            this.debounce.delete(rel);
            this.notify('spec.changed', { file: rel });
            const stage = orch.stageForSpec(rel);
            if (stage)
              void this.mutate((s) => orch.specEdited(s, stage)).catch(
                () => {},
              );
          }, 200),
        );
      });
      this.watcher.on('error', () => {});
    } catch {
      // docs/ missing or recursive watch unsupported: stale propagation is skipped, not fatal.
    }
  }

  close() {
    this.watcher?.close();
    for (const t of this.debounce.values()) clearTimeout(t);
  }
}

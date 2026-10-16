import { join } from 'node:path';
import type { StageId } from '@awp/protocol';
import pkg from '../package.json';
import { ProjectService } from './project';
import { type AdapterFactory, type Notify, RunManager } from './runs';
import type { Handlers } from './server';
import { detectTools, freshEnv } from './setup';

export function createHandlers(
  notify: Notify,
  adapters?: AdapterFactory,
): Handlers {
  const runs = new RunManager(notify, adapters);
  const dataDir = process.env.AWP_DATA_DIR ?? join(process.cwd(), 'data');
  const projects = new ProjectService(dataDir, notify);
  return {
    ping: () => 'pong',
    version: () => ({ version: pkg.version }),
    'setup.detect': () => detectTools(),
    'setup.freshEnv': () => freshEnv(),
    'project.create': (p) => {
      const { path, name } = p as { path: string; name: string };
      return projects.create(path, name);
    },
    'project.open': (p) => projects.open((p as { path: string }).path),
    'project.list': () => projects.list(),
    'stage.enter': (p) => projects.enter((p as { stage: StageId }).stage),
    'stage.complete': (p) => {
      const { stage, overrideReason } = p as {
        stage: StageId;
        overrideReason?: string;
      };
      return projects.complete(stage, overrideReason);
    },
    'stage.reopen': (p) => projects.reopen((p as { stage: StageId }).stage),
    'agent.run': (p) => ({
      runId: runs.start(p as Parameters<RunManager['start']>[0]),
    }),
    'agent.stop': async (p) => {
      await runs.stop((p as { runId: string }).runId);
      return 'ok';
    },
  };
}

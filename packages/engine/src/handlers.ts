import pkg from '../package.json';
import { type AdapterFactory, type Notify, RunManager } from './runs';
import type { Handlers } from './server';

export function createHandlers(
  notify: Notify,
  adapters?: AdapterFactory,
): Handlers {
  const runs = new RunManager(notify, adapters);
  return {
    ping: () => 'pong',
    version: () => ({ version: pkg.version }),
    'agent.run': (p) => ({
      runId: runs.start(p as Parameters<RunManager['start']>[0]),
    }),
    'agent.stop': async (p) => {
      await runs.stop((p as { runId: string }).runId);
      return 'ok';
    },
  };
}

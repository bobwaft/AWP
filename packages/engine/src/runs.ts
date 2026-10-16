import { randomUUID } from 'node:crypto';
import type { AdapterId, RunRequest } from '@awp/protocol';
import { ClaudeCodeAdapter } from './adapters/claude';
import { FakeAdapter } from './adapters/fake';
import type { AgentAdapter } from './adapters/types';

export type Notify = (method: string, params: unknown) => void;
export type AdapterFactory = (id: AdapterId, fixture?: string) => AgentAdapter;

export const defaultAdapters: AdapterFactory = (id, fixture) =>
  id === 'fake'
    ? new FakeAdapter({ fixture, delayMs: 150 })
    : new ClaudeCodeAdapter();

/** Tracks live runs and forwards their events as `run.event` notifications. */
export class RunManager {
  private active = new Map<string, AgentAdapter>();

  constructor(
    private notify: Notify,
    private adapters: AdapterFactory = defaultAdapters,
  ) {}

  start(
    input: { adapter: AdapterId; fixture?: string } & Omit<RunRequest, 'runId'>,
  ): string {
    const runId = randomUUID();
    const adapter = this.adapters(input.adapter, input.fixture);
    this.active.set(runId, adapter);
    void this.pump(runId, adapter, { ...input, runId });
    return runId;
  }

  async stop(runId: string) {
    await this.active.get(runId)?.stop(runId);
  }

  private async pump(runId: string, adapter: AgentAdapter, req: RunRequest) {
    let done = false;
    try {
      for await (const event of adapter.run(req)) {
        this.notify('run.event', { runId, event });
        if (event.type === 'done') done = true;
      }
    } catch (e) {
      this.notify('run.event', {
        runId,
        event: { type: 'error', message: String(e) },
      });
    }
    if (!done)
      this.notify('run.event', {
        runId,
        event: { type: 'done', status: 'error' },
      });
    this.active.delete(runId);
  }
}

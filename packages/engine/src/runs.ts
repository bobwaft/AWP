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

export type RunOutcome = {
  status: 'success' | 'error' | 'stopped';
  text: string;
};
export type StartInput = {
  adapter: AdapterId;
  fixture?: string;
  runId?: string;
} & Omit<RunRequest, 'runId'>;

/** Tracks live runs and forwards their events as `run.event` notifications. */
export class RunManager {
  private active = new Map<string, AgentAdapter>();

  constructor(
    private notify: Notify,
    private adapters: AdapterFactory = defaultAdapters,
  ) {}

  start(input: StartInput): string {
    return this.exec(input).runId;
  }

  /** Like start, but also resolves with the final status and the assistant's text. */
  exec(input: StartInput): { runId: string; done: Promise<RunOutcome> } {
    const runId = input.runId ?? randomUUID();
    const adapter = this.adapters(input.adapter, input.fixture);
    this.active.set(runId, adapter);
    return { runId, done: this.pump(runId, adapter, { ...input, runId }) };
  }

  async stop(runId: string) {
    await this.active.get(runId)?.stop(runId);
  }

  private async pump(
    runId: string,
    adapter: AgentAdapter,
    req: RunRequest,
  ): Promise<RunOutcome> {
    let status: RunOutcome['status'] | undefined;
    const texts: string[] = [];
    try {
      for await (const event of adapter.run(req)) {
        this.notify('run.event', { runId, event });
        if (event.type === 'message') texts.push(event.text);
        if (event.type === 'done') status = event.status;
      }
    } catch (e) {
      this.notify('run.event', {
        runId,
        event: { type: 'error', message: String(e) },
      });
    }
    if (!status) {
      status = 'error';
      this.notify('run.event', { runId, event: { type: 'done', status } });
    }
    this.active.delete(runId);
    return { status, text: texts.join('\n\n') };
  }
}

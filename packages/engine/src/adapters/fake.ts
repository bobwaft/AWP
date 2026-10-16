import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentEvent, RunRequest } from '@awp/protocol';
import { createClaudeParser } from './claude-parse';
import type { AgentAdapter } from './types';

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../test/fixtures',
);

/** Replays a recorded Claude transcript (default: claude-text-only) through the real parser. */
export class FakeAdapter implements AgentAdapter {
  id = 'fake' as const;
  private stopped = new Set<string>();

  constructor(
    private opts: {
      fixture?: string;
      dir?: string;
      delayMs?: number;
      /** Test hook: produce events programmatically (e.g. call AWP tools in-process). */
      script?: (req: RunRequest) => AsyncIterable<AgentEvent>;
    } = {},
  ) {}

  async detect() {
    return {
      installed: true,
      version: 'fake',
      loggedIn: true,
      supported: true,
    };
  }

  run(req: RunRequest) {
    return this.replay(req);
  }
  resume(_sessionId: string, req: RunRequest) {
    return this.replay(req);
  }
  async stop(runId: string) {
    this.stopped.add(runId);
  }

  private async *replay(req: RunRequest): AsyncGenerator<AgentEvent> {
    if (this.opts.script) {
      yield* this.opts.script(req);
      return;
    }
    const name = this.opts.fixture ?? 'claude-text-only';
    const file = join(
      this.opts.dir ?? FIXTURE_DIR,
      `${name.replace(/[^\w-]/g, '')}.jsonl`,
    );
    const parse = createClaudeParser();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (this.stopped.delete(req.runId)) {
        yield { type: 'done', status: 'stopped' };
        return;
      }
      if (this.opts.delayMs)
        await new Promise((r) => setTimeout(r, this.opts.delayMs));
      yield* parse(line);
    }
  }
}

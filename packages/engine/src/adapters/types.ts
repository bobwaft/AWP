import type { AdapterId, AgentEvent, RunRequest } from '@awp/protocol';

export interface AgentAdapter {
  id: AdapterId;
  detect(): Promise<{
    installed: boolean;
    version?: string;
    loggedIn: boolean;
    supported?: boolean;
  }>;
  run(req: RunRequest): AsyncIterable<AgentEvent>;
  resume(sessionId: string, req: RunRequest): AsyncIterable<AgentEvent>;
  stop(runId: string): Promise<void>;
}

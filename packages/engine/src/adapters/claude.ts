import type { ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { AgentEvent, RunRequest } from '@awp/protocol';
import { createClaudeParser } from './claude-parse';
import { killTree, spawnTree } from './process';
import type { AgentAdapter } from './types';

const exec = promisify(execFile);

// Versions the stream-json parser is tested against (fixtures recorded on 2.1.301).
export const TESTED_MAJOR_MINOR = ['2.1'];
export const isSupportedVersion = (v: string) =>
  TESTED_MAJOR_MINOR.some((p) => v.startsWith(`${p}.`));

export function buildArgs(req: RunRequest, resume?: string): string[] {
  const a = ['-p', '--output-format', 'stream-json', '--verbose'];
  if (resume) a.push('--resume', resume);
  if (req.model) a.push('--model', req.model);
  if (req.allowedTools?.length) a.push('--allowedTools', ...req.allowedTools);
  if (req.disallowedTools?.length)
    a.push('--disallowedTools', ...req.disallowedTools);
  for (const d of req.pluginDirs ?? []) a.push('--plugin-dir', d);
  if (req.settingSources?.length)
    a.push('--setting-sources', req.settingSources.join(','));
  if (req.strictMcpConfig) a.push('--strict-mcp-config');
  if (req.systemAppend) a.push('--append-system-prompt', req.systemAppend);
  if (req.mcpConfigPath) a.push('--mcp-config', req.mcpConfigPath);
  if (req.maxTurns) a.push('--max-turns', String(req.maxTurns));
  if (req.permissionPromptTool)
    a.push('--permission-prompt-tool', req.permissionPromptTool);
  // Prompt goes last, after `--`, so tool lists cannot swallow it.
  a.push('--', req.prompt);
  return a;
}

export class ClaudeCodeAdapter implements AgentAdapter {
  id = 'claude' as const;
  private children = new Map<string, ChildProcess>();
  private stopped = new Set<string>();

  constructor(private bin = 'claude') {}

  async detect() {
    try {
      const { stdout } = await exec(this.bin, ['--version'], {
        windowsHide: true,
      });
      const version = stdout.trim().split(' ')[0];
      let loggedIn = false;
      try {
        const r = await exec(this.bin, ['auth', 'status'], {
          windowsHide: true,
        });
        loggedIn = JSON.parse(r.stdout).loggedIn === true;
      } catch {}
      return {
        installed: true,
        version,
        loggedIn,
        supported: isSupportedVersion(version),
      };
    } catch {
      return { installed: false, loggedIn: false };
    }
  }

  run(req: RunRequest) {
    return this.exec(req, buildArgs(req));
  }
  resume(sessionId: string, req: RunRequest) {
    return this.exec(req, buildArgs(req, sessionId));
  }

  async stop(runId: string) {
    this.stopped.add(runId);
    const c = this.children.get(runId);
    if (c) killTree(c);
  }

  private async *exec(
    req: RunRequest,
    args: string[],
  ): AsyncGenerator<AgentEvent> {
    const child = spawnTree(this.bin, args, { cwd: req.cwd, env: req.env });
    this.children.set(req.runId, child);
    const parse = createClaudeParser();
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr = (stderr + d).slice(-2000);
    });
    const closed = new Promise<number | null>((res) => child.on('close', res));
    child.on('error', (e) => {
      stderr = String(e);
    });
    let sawDone = false;
    try {
      for await (const line of createInterface({ input: child.stdout! })) {
        for (const ev of parse(line)) {
          if (ev.type === 'done') sawDone = true;
          yield ev;
        }
      }
      const code = await closed;
      if (this.stopped.has(req.runId)) {
        yield { type: 'done', status: 'stopped' };
      } else if (!sawDone) {
        yield {
          type: 'error',
          message: stderr.trim() || `claude exited with code ${code}`,
        };
        yield { type: 'done', status: 'error' };
      }
    } finally {
      killTree(child);
      this.children.delete(req.runId);
      this.stopped.delete(req.runId);
    }
  }
}

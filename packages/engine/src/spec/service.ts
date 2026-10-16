import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { AdapterId, StageId } from '@awp/protocol';
import { EngineError } from '../errors';
import { isToolName, TOOLS } from '../mcp-tools';
import { stageForSpec } from '../orchestrator';
import type { ProjectService } from '../project';
import type { Notify, RunManager } from '../runs';
import { SPEC_STAGES } from './config';
import { type McpLauncher, SpecSession } from './session';

export type SpecServiceOpts = {
  adapter: AdapterId;
  model?: string;
  mcp?: McpLauncher;
  hasFigma?: () => Promise<boolean>;
};

/** Owns one SpecSession per spec stage of the open project and routes agent tool calls to them. */
export class SpecService {
  private sessions = new Map<string, SpecSession>();
  private byRun = new Map<string, SpecSession>();

  constructor(
    private projects: ProjectService,
    private notify: Notify,
    private runs: RunManager,
    private opts: SpecServiceOpts,
  ) {}

  async session(stage: StageId): Promise<SpecSession> {
    const cfg = SPEC_STAGES[stage];
    const root = this.projects.root;
    if (!cfg)
      throw new EngineError('STAGE_NOT_SPEC', `${stage} has no spec interview`);
    const key = `${root}::${stage}`;
    let s = this.sessions.get(key);
    if (!s) {
      const session: SpecSession = new SpecSession({
        root,
        cfg,
        notify: this.notify,
        runs: this.runs,
        adapter: this.opts.adapter,
        model: this.opts.model,
        mcp: this.opts.mcp,
        hasFigma: this.opts.hasFigma,
        register: (runId) => this.byRun.set(runId, session),
        getState: () => this.projects.state,
        recordRound: () => this.projects.recordRound(stage),
      });
      s = await session.load();
      this.sessions.set(key, s);
    }
    return s;
  }

  /** Path inside docs/ only; blocks traversal and absolute paths. */
  private docPath(file: string) {
    const abs = resolve(this.projects.root, file);
    const docs = join(this.projects.root, 'docs') + sep;
    if (!abs.startsWith(docs))
      throw new EngineError(
        'PATH_NOT_ALLOWED',
        'Only files in docs/ can be read or saved',
      );
    return abs;
  }

  async read(file: string) {
    const content = await readFile(this.docPath(file), 'utf8').catch(() => '');
    const stage = stageForSpec(
      relative(this.projects.root, this.docPath(file)),
    );
    const base = stage
      ? await readFile(
          join(this.projects.root, '.awp', 'spec', `${stage}.base.md`),
          'utf8',
        ).catch(() => null)
      : null;
    return { content, base };
  }

  async save(file: string, content: string) {
    const abs = this.docPath(file);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }

  /** Gate (PRD 5.2.1): zero blocking after at least one critic round, or override after the cap. */
  checkGate(stage: StageId, overrideReason?: string) {
    const cfg = SPEC_STAGES[stage];
    if (!cfg) return;
    const state = this.projects.state;
    const rounds = state.stages[stage].criticRounds;
    const cached = this.sessions.get(`${this.projects.root}::${stage}`);
    const blocking = cached?.blocking ?? 0;
    if (state.stages[stage].status === 'stale') return; // re-confirming after an upstream change
    if (rounds === 0 && !cached?.critique)
      throw new EngineError(
        'GATE_BLOCKED',
        'The review step has not run yet',
        'Describe your idea in the chat first.',
      );
    if (blocking === 0) return;
    if (rounds >= cfg.maxRounds && overrideReason?.trim()) return;
    throw new EngineError(
      'GATE_BLOCKED',
      `${blocking} blocking question${blocking === 1 ? '' : 's'} left`,
      rounds >= cfg.maxRounds
        ? 'Answer them, or complete anyway with a reason.'
        : 'Answer them in the chat.',
    );
  }

  /** Agent tool call from the MCP bridge (or an in-process test script). */
  async callTool(runId: string, name: string, args: unknown): Promise<unknown> {
    if (!isToolName(name))
      throw new EngineError('TOOL_UNKNOWN', `No tool ${name}`);
    const session = this.byRun.get(runId);
    if (!session)
      throw new EngineError('RUN_UNKNOWN', 'No spec session for this run');
    const parsed = TOOLS[name].input.safeParse(args);
    if (!parsed.success)
      throw new EngineError(
        'TOOL_ARGS_INVALID',
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const a = parsed.data as never;
    switch (name) {
      case 'ask_user': {
        const { question, choices } = a as {
          question: string;
          choices?: string[];
        };
        return session.askUser(question, choices);
      }
      case 'request_form':
        return session.requestForm(args);
      case 'submit_critique':
        return session.submitCritique(args);
      case 'remember': {
        await appendFile(
          join(this.projects.root, 'MEMORY.md'),
          `- ${(a as { fact: string }).fact.trim()}\n`,
        );
        return { ok: true };
      }
      case 'submit_themes':
        return session.submitThemes(args);
      case 'approve_permission': {
        const { tool_name, input } = a as { tool_name: string; input: unknown };
        const d = await session.requestPermission(tool_name, input);
        return d.allow
          ? { behavior: 'allow', updatedInput: input }
          : {
              behavior: 'deny',
              message: d.message || 'The user denied this action.',
            };
      }
      default:
        throw new EngineError('NOT_AVAILABLE', `${name} is not available yet`);
    }
  }

  /** Finds the session that owns an open question, form or permission request. */
  owner(kind: 'question' | 'form' | 'permission', id: string): SpecSession {
    for (const s of this.sessions.values()) {
      const open =
        kind === 'question'
          ? s.question?.questionId
          : kind === 'form'
            ? s.form?.formId
            : s.permission?.requestId;
      if (open === id) return s;
    }
    throw new EngineError('NOT_FOUND', `No open ${kind} with that id`);
  }

  forget(runId: string) {
    this.byRun.delete(runId);
  }
}

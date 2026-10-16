import { join } from 'node:path';
import type { AdapterId, FormValues, StageId } from '@awp/protocol';
import pkg from '../package.json';
import { ProjectService } from './project';
import { type AdapterFactory, type Notify, RunManager } from './runs';
import type { Handlers } from './server';
import { detectTools, freshEnv } from './setup';
import { mcpLauncher, startBridge } from './spec/bridge';
import { addRef, readRefs } from './spec/design';
import { SpecService } from './spec/service';

export type HandlerOpts = {
  specAdapter?: AdapterId;
  withMcp?: boolean;
  /** Reads a keychain secret via the Rust core (see outbound.ts). */
  getSecret?: (key: string) => Promise<string | null>;
};

export function createHandlers(
  notify: Notify,
  adapters?: AdapterFactory,
  opts: HandlerOpts = {},
): Handlers & { _spec: () => Promise<SpecService>; _projects: ProjectService } {
  const runs = new RunManager(notify, adapters);
  const dataDir = process.env.AWP_DATA_DIR ?? join(process.cwd(), 'data');
  const projects = new ProjectService(dataDir, notify);

  // The spec engine (and its localhost MCP bridge) starts on first use.
  let spec: Promise<SpecService> | undefined;
  const getSpec = () => {
    spec ??= (async () => {
      const bridge =
        opts.withMcp === false
          ? undefined
          : await startBridge((r, n, a) => svc.callTool(r, n, a));
      const svc: SpecService = new SpecService(projects, notify, runs, {
        adapter: opts.specAdapter ?? 'claude',
        model: process.env.AWP_MODEL, // dev override until routing (Phase 10)
        mcp:
          bridge &&
          ((runId, o) =>
            mcpLauncher(
              projects.root,
              bridge,
              () =>
                opts.getSecret?.('awp/figma/default') ?? Promise.resolve(null),
            )(runId, o)),
        hasFigma: async () =>
          !!(await opts.getSecret?.('awp/figma/default').catch(() => null)),
      });
      return svc;
    })();
    return spec;
  };
  const owner = async <K extends 'question' | 'form' | 'permission'>(
    kind: K,
    id: string,
  ) => (await getSpec()).owner(kind, id);

  return {
    _spec: getSpec,
    _projects: projects,
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
    'stage.complete': async (p) => {
      const { stage, overrideReason } = p as {
        stage: StageId;
        overrideReason?: string;
      };
      (await getSpec()).checkGate(stage, overrideReason);
      return projects.complete(stage, overrideReason);
    },
    'stage.reopen': (p) => projects.reopen((p as { stage: StageId }).stage),
    'spec.get': async (p) =>
      (
        await (await getSpec()).session((p as { stage: StageId }).stage)
      ).snapshot(),
    'spec.read': async (p) =>
      (await getSpec()).read((p as { file: string }).file),
    'spec.save': async (p) => {
      const { file, content } = p as { file: string; content: string };
      await (await getSpec()).save(file, content);
      return 'ok';
    },
    'chat.send': async (p) => {
      const { stage, text, attachments } = p as {
        stage: StageId;
        text: string;
        attachments?: string[];
      };
      const session = await (await getSpec()).session(stage);
      return { runId: await session.send(text, attachments) };
    },
    'question.answer': async (p) => {
      const { questionId, answer } = p as {
        questionId: string;
        answer: string;
      };
      await (await owner('question', questionId)).answerQuestion(
        questionId,
        answer,
      );
      return 'ok';
    },
    'form.submit': async (p) => {
      const { formId, values, unsure } = p as {
        formId: string;
        values: FormValues;
        unsure: string[];
      };
      await (await owner('form', formId)).submitForm(formId, values, unsure);
      return 'ok';
    },
    'form.decline': async (p) => {
      const { formId } = p as { formId: string };
      await (await owner('form', formId)).declineForm(formId);
      return 'ok';
    },
    'form.saveDraft': async (p) => {
      const { formId, values } = p as { formId: string; values: FormValues };
      await (await owner('form', formId)).saveDraft(formId, values);
      return 'ok';
    },
    'form.ask': async (p) => {
      const { formId, text, draft } = p as {
        formId: string;
        text: string;
        draft: FormValues;
      };
      await (await owner('form', formId)).askAboutForm(formId, text, draft);
      return 'ok';
    },
    'design.refs': async () => readRefs(projects.root),
    'design.addRef': async (p) =>
      addRef(projects.root, (p as { source: string }).source),
    'design.propose': async (p) => {
      await (await (await getSpec()).session('design')).proposeThemes(
        (p as { feedback?: string }).feedback,
      );
      return 'ok';
    },
    'design.pickTheme': async (p) => {
      const { themeId, tweaks } = p as {
        themeId: string;
        tweaks?: Record<string, unknown>;
      };
      await (await (await getSpec()).session('design')).pickTheme(
        themeId,
        tweaks,
      );
      return 'ok';
    },
    'permission.decide': async (p) => {
      const { requestId, allow, message } = p as {
        requestId: string;
        allow: boolean;
        message?: string;
      };
      (await owner('permission', requestId)).decidePermission(
        requestId,
        allow,
        message,
      );
      return 'ok';
    },
    'agent.run': (p) => ({
      runId: runs.start(p as Parameters<RunManager['start']>[0]),
    }),
    'agent.stop': async (p) => {
      await runs.stop((p as { runId: string }).runId);
      return 'ok';
    },
  };
}

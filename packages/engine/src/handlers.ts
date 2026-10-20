import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AdapterId,
  type FormValues,
  type Phase,
  parsePhasesMd,
  type StageId,
  SuggestionsInput,
  type VerifyCommands,
  validatePhases,
} from '@awp/protocol';
import pkg from '../package.json';
import { EngineError } from './errors';
import { ProjectService } from './project';
import { loadRegistry } from './registry/load';
import { ensurePluginDir } from './registry/plugin-cache';
import { RegistryService } from './registry/service';
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
  /** Tests: replaces fetching the recommender plugin. */
  ensurePlugin?: () => Promise<string | null>;
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

  // Connectors: discovery, decisions and installs (one service for the process; state is per project).
  const registryFile = () =>
    loadRegistry({
      dataDir,
      fetchRemote: process.env.AWP_REGISTRY_URL
        ? async () => {
            const r = await fetch(process.env.AWP_REGISTRY_URL as string, {
              signal: AbortSignal.timeout(8000),
            });
            if (!r.ok) throw new Error(`registry fetch failed: ${r.status}`);
            return r.json();
          }
        : undefined,
    }).then((r) => r.registry);
  const readDoc = (root: string, name: string) =>
    readFile(join(root, 'docs', name), 'utf8').catch(() => '');
  let registrySvc: RegistryService | undefined;
  const getRegistry = () => {
    registrySvc ??= new RegistryService({
      root: () => projects.root,
      cacheDir: join(dataDir, 'registry-git'),
      notify,
      registry: registryFile,
      readSpecs: async (root) => ({
        prd: await readDoc(root, 'PRD.md'),
        design: await readDoc(root, 'DESIGN.md'),
        architecture: await readDoc(root, 'ARCHITECTURE.md'),
      }),
      ensurePlugin:
        opts.ensurePlugin ??
        (async () => {
          const item = (await registryFile()).items.find(
            (i) => i.id === 'claude-code-setup',
          );
          return item
            ? ensurePluginDir({ dataDir, source: item.source })
            : null;
        }),
      getSecret: opts.getSecret,
      runAgent: async (req) => {
        const spec = await getSpec();
        const runId = randomUUID();
        let submitted: SuggestionsInput | null = null;
        const off = spec.registerSink(runId, async (name, args) => {
          if (name !== 'submit_suggestions')
            throw new EngineError(
              'NOT_AVAILABLE',
              `${name} is not available during discovery`,
            );
          const p = SuggestionsInput.safeParse(args);
          if (!p.success)
            throw new EngineError(
              'TOOL_ARGS_INVALID',
              p.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; '),
            );
          submitted = p.data;
          return { ok: true, count: p.data.suggestions.length };
        });
        try {
          const mcp = await spec.mcp?.(runId, { figma: false });
          const { done } = runs.exec({
            adapter: spec.adapter,
            runId,
            cwd: req.root ?? projects.root,
            prompt: req.prompt,
            model: spec.model ?? 'sonnet', // dev default until routing (Phase 10)
            allowedTools: req.allowedTools,
            disallowedTools: req.disallowedTools,
            pluginDirs: req.pluginDirs,
            settingSources: req.settingSources,
            strictMcpConfig: req.strictMcpConfig,
            mcpConfigPath: mcp?.path,
            env: mcp?.env,
            maxTurns: 30,
          });
          const out = await done;
          return { status: out.status, text: out.text, submitted };
        } finally {
          off();
        }
      },
    });
    return registrySvc;
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
      await (await getSpec()).checkGate(stage, overrideReason);
      if (stage === 'connectors') {
        const problem = await getRegistry().gateProblem();
        if (problem && !overrideReason?.trim())
          throw new EngineError(
            'GATE_BLOCKED',
            problem,
            'Install or undo the approved items first.',
          );
      }
      const next = await projects.complete(stage, overrideReason);
      // Planning is the last spec stage: discovery of tools, skills and MCPs starts in the background.
      if (stage === 'planning')
        void getRegistry()
          .beginDiscovery()
          .catch(() => {});
      return next;
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
    'plan.propose': async (p) => {
      const session = await (await getSpec()).session('planning');
      await session.send(
        (p as { feedback?: string }).feedback?.trim() ||
          'Please propose stack options.',
      );
      return 'ok';
    },
    'plan.pickStack': async (p) => {
      const { optionId, edits } = p as {
        optionId: string;
        edits?: { verify?: Partial<VerifyCommands>; notes?: string };
      };
      await (await (await getSpec()).session('planning')).pickStack(
        optionId,
        edits,
      );
      return 'ok';
    },
    'plan.phases': async () => {
      const text = await readFile(
        join(projects.root, 'docs', 'PHASES.md'),
        'utf8',
      ).catch(() => '');
      return { ...parsePhasesMd(text), text };
    },
    'plan.savePhases': async (p) => {
      const { phases } = p as { phases: Phase[] };
      const errors = validatePhases(phases);
      // Structural problems are reported, but the owner's edit is still saved (hand edits are never lost).
      await (await (await getSpec()).session('planning')).savePhases(phases);
      return { errors };
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
    'registry.suggest': (p) =>
      getRegistry().suggest((p as { refresh?: boolean } | undefined)?.refresh),
    'registry.decide': (p) =>
      getRegistry().decide(
        p as {
          id: string;
          decision: 'approve' | 'reject' | 'undo';
          reason?: string;
          variant?: string;
        },
      ),
    'registry.addCustom': (p) =>
      getRegistry().addCustom(
        p as {
          repoUrl?: string;
          sha?: string;
          path?: string;
          localPath?: string;
        },
      ),
    'registry.preview': (p) => getRegistry().preview((p as { id: string }).id),
    'registry.install': (p) =>
      getRegistry().install(
        p as {
          id: string;
          previewId?: string;
          confirmScripts?: boolean;
          acknowledged?: boolean;
        },
      ),
    'agent.run': (p) => ({
      runId: runs.start(p as Parameters<RunManager['start']>[0]),
    }),
    'agent.stop': async (p) => {
      await runs.stop((p as { runId: string }).runId);
      return 'ok';
    },
  };
}

import type {
  InstallPreview,
  InstallResult,
  RegistryFile,
  RegistryItem,
  Suggestion,
  SuggestionsState,
  SuggestionView,
} from '@awp/protocol';
import { EngineError } from '../errors';
import { bundledSource } from './bundled';
import { customFromLocal, customFromRepo, localSource } from './custom';
import { type DiscoverDeps, discover } from './discover';
import { assertSafeArgv, type Exec } from './exec';
import { fetchSource } from './git-fetch';
import { licenseStatus } from './license';
import { type Candidate, repoKey, type Specs } from './match';
import { buildPreview, type Preview } from './preview';
import { redact } from './redact';
import { rejectedFrom, SuggestionStore } from './state';
import { writeTooling } from './tooling-md';
import { runInstaller } from './writers/installer';
import { writeMcpEntry } from './writers/mcp-json';
import { installPlugin, pluginCommands } from './writers/plugin';
import { installSkill } from './writers/skill';

export type ServiceDeps = {
  /** Root of the open project (throws when none is open). */
  root: () => string;
  /** Where bare git caches live (app data). */
  cacheDir: string;
  notify: (method: string, params: unknown) => void;
  registry: () => Promise<RegistryFile>;
  /** Reads the specs of the given project (not necessarily the open one). */
  readSpecs: (root: string) => Promise<Specs>;
  ensurePlugin: DiscoverDeps['ensurePlugin'];
  runAgent: DiscoverDeps['runAgent'];
  getSecret?: (key: string) => Promise<string | null>;
  exec?: Exec;
  /** Tests only: allow file:// sources. */
  allowAnyUrl?: boolean;
};

type Install = RegistryItem['install'];
const MAX_PREVIEWS = 16;

/**
 * The committed `.awp/suggestions.json` is data from a repository, not from AWP: a clone can carry
 * anything. What may be installed is therefore decided here, never by the row.
 * - registry rows: the item is the live registry's (the row's copy is ignored);
 * - recommender rows: record-only (`doc`), never verified;
 * - user rows: only a skill from a repo or a folder, never verified, no variants or secrets.
 */
function trusted(row: Suggestion, registry: RegistryFile): RegistryItem | null {
  if (row.source === 'registry')
    return registry.items.find((i) => i.id === row.id) ?? null;
  const it = row.item;
  if (!it) return null;
  const clean = {
    variants: [],
    guards: [],
    requires: { accounts: [], env: [] },
  };
  if (row.source === 'recommender')
    return {
      ...it,
      ...clean,
      verified: false,
      install: it.install.type === 'doc' ? it.install : { type: 'doc' },
    };
  if (it.install.type !== 'skill' && it.install.type !== 'local') return null;
  return { ...it, ...clean, verified: false };
}

/**
 * The commands the UI may type into a terminal tab (and press Enter) when the user approves: only
 * owner-verified registry items, only plain tokens, nothing that needs input (`<placeholder>`).
 */
function terminalCommands(
  item: RegistryItem,
  row: Suggestion,
): string[][] | undefined {
  if (row.source !== 'registry' || !item.verified) return undefined;
  const i = item.install;
  let cmds: string[][];
  if (i.type === 'installer') cmds = i.commands;
  else if (i.type === 'plugin') cmds = pluginCommands(i.marketplace, i.plugin);
  else if (i.type === 'doc' && i.command?.trim())
    cmds = [i.command.trim().split(/\s+/)];
  else return undefined;
  try {
    for (const c of cmds) assertSafeArgv(c);
  } catch {
    return undefined;
  }
  return cmds;
}

/** Connectors: discovery, decisions and installs. State is per project; one project at a time is open. */
export class RegistryService {
  private stores = new Map<string, SuggestionStore>();
  private previews = new Map<
    string,
    { id: string; root: string; preview: Preview }
  >();
  private pending = new Map<string, Promise<void>>();
  private running = new Set<string>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(private d: ServiceDeps) {}

  private store(root: string) {
    const have = this.stores.get(root);
    if (have) return have;
    const fresh = new SuggestionStore(root);
    this.stores.set(root, fresh);
    return fresh;
  }

  /** Runs `fn` after any earlier call with the same key, so decisions and installs never interleave. */
  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {});
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return next;
  }

  private remember(root: string, id: string, preview: Preview) {
    this.previews.set(preview.previewId, { id, root, preview });
    while (this.previews.size > MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value;
      if (oldest === undefined) break;
      this.previews.delete(oldest);
    }
  }

  // ---- discovery ----

  /** The current state; the first call for a project also starts discovery. */
  async suggest(refresh = false): Promise<SuggestionsState> {
    const root = this.d.root();
    const st = await this.store(root).load();
    if (
      !this.running.has(root) &&
      st.discovery.status !== 'running' &&
      (refresh || (st.items.length === 0 && st.discovery.status === 'idle'))
    )
      await this.beginDiscovery();
    return this.state(root);
  }

  /** Runs discovery to completion (tests, and callers that want to wait). */
  async runDiscovery(): Promise<void> {
    await this.beginDiscovery();
    await this.idle();
  }

  /** Resolves when the open project's discovery (if any) has finished. */
  idle(): Promise<void> {
    return this.pending.get(this.d.root()) ?? Promise.resolve();
  }

  /** Starts discovery in the background unless it is already running for this project. */
  async beginDiscovery(): Promise<void> {
    const root = this.d.root();
    if (this.running.has(root)) return;
    this.running.add(root);
    const store = this.store(root);
    await store.mutate((s) => {
      s.discovery = { status: 'running' };
    });
    await this.push(root);
    const body = this.discoverBody(root, store).finally(() =>
      this.running.delete(root),
    );
    this.pending.set(
      root,
      Promise.all([this.pending.get(root), body]).then(() => {}),
    );
  }

  private async discoverBody(root: string, store: SuggestionStore) {
    try {
      const [specs, registry, st] = await Promise.all([
        this.d.readSpecs(root),
        this.d.registry(),
        store.load(),
      ]);
      const res = await discover({
        registry,
        specs,
        rejected: rejectedFrom(st.items),
        root,
        ensurePlugin: this.d.ensurePlugin,
        runAgent: this.d.runAgent,
      });
      await store.mutate((s) => {
        const kept = s.items.filter((i) => i.status !== 'suggested');
        const have = new Set(kept.map((i) => i.id));
        const fresh = res.candidates.filter((c) => !have.has(c.id)).map(toRow);
        s.items = [...kept, ...fresh];
        s.discovery = {
          status: 'done',
          source: res.source,
          at: new Date().toISOString(),
          ...(res.note ? { note: res.note } : {}),
        };
      });
    } catch (e) {
      const note = `Discovery failed: ${redact(e instanceof Error ? e.message : String(e))}`;
      try {
        await store.mutate((s) => {
          s.discovery = {
            status: 'failed',
            at: new Date().toISOString(),
            note,
          };
        });
      } catch {
        // the state file itself is unwritable: nothing more to record
      }
    }
    await this.push(root).catch(() => {});
  }

  /** Why Connectors cannot be completed yet, or null. Zero approvals is fine. */
  async gateProblem(): Promise<string | null> {
    const root = this.d.root();
    const st = await this.store(root).load();
    if (this.running.has(root) || st.discovery.status === 'running')
      return 'Discovery is still running';
    const open = st.items.filter(
      (i) => i.status === 'approved' || i.status === 'failed',
    );
    if (open.length)
      return `${open.length} approved item${open.length === 1 ? ' is' : 's are'} not installed yet`;
    return null;
  }

  // ---- view ----

  async state(root = this.d.root()): Promise<SuggestionsState> {
    const [st, registry] = await Promise.all([
      this.store(root).load(),
      this.d.registry(),
    ]);
    const items: SuggestionView[] = [];
    for (const row of st.items) {
      const item = trusted(row, registry);
      if (item) items.push(await this.view(row, item));
    }
    // a run that has started but not yet written its state still counts as running
    const discovery = this.running.has(root)
      ? { ...st.discovery, status: 'running' as const }
      : st.discovery;
    return { discovery, items };
  }

  private async view(
    row: Suggestion,
    item: RegistryItem,
  ): Promise<SuggestionView> {
    const missing: SuggestionView['missingSecrets'] = [];
    for (const e of item.requires.env)
      if (
        !e.optional &&
        !(await this.d.getSecret?.(e.secretKey).catch(() => null))
      )
        missing.push({ name: e.name, secretKey: e.secretKey, help: e.help });
    const inst = item.install;
    return {
      ...row,
      verified: item.verified,
      item,
      license: licenseStatus(item),
      missingSecrets: missing,
      action:
        inst.type === 'skill' ||
        inst.type === 'bundled' ||
        inst.type === 'local'
          ? 'preview'
          : inst.type,
      command: commandText(inst),
      notPinned: inst.type === 'plugin' && !inst.ref,
      terminal: (() => {
        const commands = terminalCommands(item, row);
        return commands ? { commands } : undefined;
      })(),
    };
  }

  /** Tells the UI (only if this project is the open one) and keeps docs/TOOLING.md in step. */
  private async push(root: string) {
    const st = await this.state(root);
    let open: string | undefined;
    try {
      open = this.d.root();
    } catch {
      open = undefined;
    }
    if (open === root) this.d.notify('registry.state', st);
    // docs/TOOLING.md follows the decisions (not the bare suggestions, to keep the tree quiet)
    if (st.items.some((i) => i.status !== 'suggested'))
      await writeTooling(root, st.items).catch(() => {});
  }

  // ---- decisions ----

  decide(a: {
    id: string;
    decision: 'approve' | 'reject' | 'undo';
    reason?: string;
    variant?: string;
  }): Promise<SuggestionsState> {
    const root = this.d.root();
    return this.lock(`${root}::${a.id}`, async () => {
      const state = await this.state(root);
      const view = state.items.find((i) => i.id === a.id);
      if (!view) throw new EngineError('NOT_FOUND', `No suggestion "${a.id}"`);
      if (view.status === 'installed' && a.decision !== 'approve')
        throw new EngineError(
          'ALREADY_INSTALLED',
          'This is already installed.',
        );
      if (a.decision === 'approve') {
        if (view.license.status === 'blocked')
          throw new EngineError('LICENSE_BLOCKED', view.license.note);
        if (a.variant && !view.item.variants.some((v) => v.id === a.variant))
          throw new EngineError('INVALID_VARIANT', `No variant "${a.variant}"`);
      }
      await this.store(root).mutate((s) => {
        const r = s.items.find((i) => i.id === a.id);
        if (!r) return;
        if (a.decision === 'approve') {
          r.status = 'approved';
          r.variant = a.variant;
          r.error = undefined;
        } else if (a.decision === 'reject') {
          r.status = 'rejected';
          if (a.reason) r.reason = a.reason;
        } else {
          r.status = 'suggested';
          r.variant = undefined;
        }
        r.at = new Date().toISOString();
      });
      await this.push(root);
      return this.state(root);
    });
  }

  /**
   * The UI ran the item's command in a terminal tab and saw it finish: record the result. The engine
   * never types into a terminal itself; it only accepts a result for an item that qualifies.
   */
  report(a: { id: string; exitCode: number }): Promise<SuggestionsState> {
    const root = this.d.root();
    return this.lock(`${root}::${a.id}`, async () => {
      const { row, item } = await this.find(root, a.id);
      if (row.status === 'installed')
        throw new EngineError(
          'ALREADY_INSTALLED',
          'This is already installed.',
        );
      if (!terminalCommands(item, row))
        throw new EngineError(
          'NOT_ALLOWED',
          'This item is not installed through the terminal.',
        );
      if (row.status !== 'approved' && row.status !== 'failed')
        throw new EngineError('NOT_APPROVED', 'Approve it first.');
      await this.store(root).mutate((s) => {
        const r = s.items.find((i) => i.id === a.id);
        if (!r) return;
        if (a.exitCode === 0) {
          r.status = 'installed';
          r.via = 'terminal';
          r.error = undefined;
        } else {
          r.status = 'failed';
          r.error = `The command exited with code ${a.exitCode}. See the terminal.`;
        }
        r.at = new Date().toISOString();
      });
      await this.push(root);
      return this.state(root);
    });
  }

  // ---- items the user adds themselves ----

  /** Adds a skill from a GitHub repo or a local folder. Always unverified, never auto-approved for install. */
  addCustom(a: {
    repoUrl?: string;
    sha?: string;
    path?: string;
    localPath?: string;
  }): Promise<SuggestionsState> {
    const root = this.d.root();
    return this.lock(`${root}::custom`, async () => {
      if (!!a.repoUrl === !!a.localPath)
        throw new EngineError(
          'INVALID_ARGS',
          'Give a repository URL or a local folder, not both.',
        );
      const c = a.repoUrl
        ? await customFromRepo({
            repoUrl: a.repoUrl.trim(),
            sha: a.sha?.trim() || undefined,
            path: a.path,
            cacheDir: this.d.cacheDir,
            allowAnyUrl: this.d.allowAnyUrl,
          })
        : await customFromLocal((a.localPath as string).trim());
      const registry = await this.d.registry();
      await this.store(root).mutate((s) => {
        const same = (i: Suggestion) =>
          i.source === 'user' &&
          i.item &&
          JSON.stringify([i.item.source, i.item.install]) ===
            JSON.stringify([c.item.source, c.item.install]);
        const prior = s.items.find(same);
        const taken = new Set([
          ...registry.items.map((i) => i.id),
          ...s.items.filter((i) => i !== prior).map((i) => i.id),
        ]);
        let id = prior?.id ?? c.item.id;
        for (let n = 2; !prior && taken.has(id); n++) id = `${c.item.id}-${n}`;
        const item = { ...c.item, id };
        const key = repoKey(item.source.repo);
        // adding something yourself overrides an earlier rejection of the same repository
        s.items = s.items.filter(
          (i) =>
            i !== prior &&
            !(i.status === 'rejected' && key && i.repoKey === key),
        );
        s.items.push({
          id,
          repoKey: key,
          source: 'user',
          verified: false,
          idea: false,
          alternatives: [],
          status: 'approved',
          reason: 'Added by you.',
          item,
          at: new Date().toISOString(),
        });
      });
      await this.push(root);
      return this.state(root);
    });
  }

  // ---- preview and install ----

  async preview(id: string): Promise<InstallPreview> {
    const root = this.d.root();
    const { row, item } = await this.find(root, id);
    const wire = (
      preview: Preview,
      extra: Partial<InstallPreview> = {},
    ): InstallPreview => ({
      id,
      previewId: preview.previewId,
      tree: preview.tree,
      license: item.license,
      target: `.claude/skills/${id}`,
      files: preview.files,
      skillMd: preview.skillMd,
      scripts: preview.scripts,
      needsScriptConfirm: preview.needsScriptConfirm,
      ...extra,
    });

    if (item.install.type === 'local') {
      if (row.source !== 'user')
        throw new EngineError(
          'INSTALL_NOT_ALLOWED',
          'Only folders you added yourself can be installed from disk.',
        );
      const preview = await buildPreview(await localSource(item.install.dir));
      this.remember(root, id, preview);
      return wire(preview);
    }
    if (item.install.type === 'bundled') {
      const src = bundledSource(id);
      if (!src) throw new EngineError('NOT_FOUND', `No bundled skill "${id}"`);
      const preview = await buildPreview(src);
      this.remember(root, id, preview);
      return wire(preview);
    }
    if (item.install.type !== 'skill')
      throw new EngineError(
        'NOT_PREVIEWABLE',
        'Only skills are installed from files.',
      );
    const { repo, sha, path, tree } = item.source;
    if (!repo || !sha)
      throw new EngineError(
        'SOURCE_INVALID',
        'This item has no pinned source.',
      );
    const src = await fetchSource({
      cacheDir: this.d.cacheDir,
      repo,
      sha,
      path: path ?? '',
      expectedTree: tree,
      allowAnyUrl: this.d.allowAnyUrl,
    });
    const preview = await buildPreview(src);
    this.remember(root, id, preview);
    return wire(preview, { repo, sha });
  }

  install(a: {
    id: string;
    previewId?: string;
    confirmScripts?: boolean;
    acknowledged?: boolean;
  }): Promise<{ result: InstallResult; state: SuggestionsState }> {
    const root = this.d.root();
    return this.lock(`${root}::${a.id}`, () => this.installLocked(root, a));
  }

  private async installLocked(
    root: string,
    a: {
      id: string;
      previewId?: string;
      confirmScripts?: boolean;
      acknowledged?: boolean;
    },
  ): Promise<{ result: InstallResult; state: SuggestionsState }> {
    const { row, item } = await this.find(root, a.id);
    if (row.status === 'installed')
      throw new EngineError('ALREADY_INSTALLED', 'This is already installed.');
    if (row.status !== 'approved' && row.status !== 'failed')
      throw new EngineError('NOT_APPROVED', 'Approve it first.');
    if (!item.verified && !a.acknowledged)
      throw new EngineError(
        'NOT_ACKNOWLEDGED',
        'This item has not been reviewed by AWP.',
        'Read its source and license, then confirm.',
      );
    const chosen = row.variant
      ? item.variants.find((v) => v.id === row.variant)
      : undefined;
    const install = chosen?.install ?? item.install;

    const secrets: string[] = [];
    const missing: string[] = [];
    for (const e of item.requires.env) {
      const v = await this.d.getSecret?.(e.secretKey).catch(() => null);
      if (v) secrets.push(v);
      else if (!e.optional) missing.push(e.name);
    }
    if (missing.length)
      throw new EngineError(
        'ACCOUNT_REQUIRED',
        `Connect your account first (${missing.join(', ')}).`,
        'Add the token in Setup, then install.',
      );

    let preview: Preview | undefined;
    const fromFiles =
      install.type === 'skill' ||
      install.type === 'bundled' ||
      install.type === 'local';
    if (install.type === 'local' && row.source !== 'user')
      throw new EngineError(
        'INSTALL_NOT_ALLOWED',
        'Only folders you added yourself can be installed from disk.',
      );
    if (fromFiles) {
      if (!a.previewId)
        throw new EngineError(
          'PREVIEW_REQUIRED',
          'Review the files before installing.',
        );
      const p = this.previews.get(a.previewId);
      if (!p || p.id !== a.id || p.root !== root)
        throw new EngineError(
          'PREVIEW_UNKNOWN',
          'That preview is no longer available. Review the files again.',
        );
      if (p.preview.needsScriptConfirm && !a.confirmScripts)
        throw new EngineError(
          'SCRIPTS_NOT_CONFIRMED',
          'This skill contains scripts or permissions that need your confirmation.',
        );
      preview = p.preview;
    }
    if (
      install.type === 'installer' &&
      !(item.verified && row.source === 'registry')
    )
      throw new EngineError(
        'INSTALLER_NOT_ALLOWED',
        'Only owner-verified registry items can run an installer.',
      );

    let result: InstallResult;
    try {
      result = await this.run(install, {
        root,
        item,
        preview,
        confirmScripts: a.confirmScripts,
        secrets,
      });
    } catch (e) {
      const message = redact(
        e instanceof EngineError ? e.message : String(e),
        secrets,
      );
      await this.store(root).mutate((s) => {
        const r = s.items.find((i) => i.id === a.id);
        if (r) {
          r.status = 'failed';
          r.error = message;
        }
      });
      await this.push(root);
      throw e;
    }
    if (a.previewId) this.previews.delete(a.previewId);
    await this.store(root).mutate((s) => {
      const r = s.items.find((i) => i.id === a.id);
      if (r) {
        r.status = 'installed';
        r.error = undefined;
        r.at = new Date().toISOString();
      }
    });
    await this.push(root);
    return { result, state: await this.state(root) };
  }

  private async run(
    install: Install,
    c: {
      root: string;
      item: RegistryItem;
      preview?: Preview;
      confirmScripts?: boolean;
      secrets: string[];
    },
  ): Promise<InstallResult> {
    switch (install.type) {
      case 'mcp':
        // an existing entry of this name is never replaced, whoever wrote it
        await writeMcpEntry({
          root: c.root,
          name: c.item.id,
          entry: install.entry,
          secrets: c.secrets,
        });
        return { status: 'installed' };
      case 'plugin': {
        const r = await installPlugin({
          root: c.root,
          marketplace: install.marketplace,
          plugin: install.plugin,
          exec: this.d.exec,
        });
        return {
          status: 'installed',
          output: r.output,
          note: install.ref
            ? undefined
            : 'Not pinned: Claude Code installs the latest version.',
        };
      }
      case 'installer': {
        const r = await runInstaller({
          root: c.root,
          commands: install.commands,
          exec: this.d.exec,
        });
        return { status: 'installed', output: r.output };
      }
      case 'local':
      case 'bundled':
      case 'skill':
        await installSkill({
          root: c.root,
          itemId: c.item.id,
          preview: c.preview as Preview,
          confirmScripts: c.confirmScripts,
        });
        return { status: 'installed' };
      case 'doc':
        return {
          status: 'recorded',
          note: install.command
            ? 'Recorded in docs/TOOLING.md. Run the command yourself.'
            : 'Recorded in docs/TOOLING.md.',
        };
    }
  }

  private async find(root: string, id: string) {
    const [st, registry] = await Promise.all([
      this.store(root).load(),
      this.d.registry(),
    ]);
    const row = st.items.find((i) => i.id === id);
    const item = row ? trusted(row, registry) : null;
    if (!row || !item)
      throw new EngineError('NOT_FOUND', `No suggestion "${id}"`);
    return { row, item };
  }
}

function toRow(c: Candidate): Suggestion {
  return {
    id: c.id,
    repoKey: repoKey(c.item.source.repo),
    source: c.source,
    verified: c.verified,
    idea: c.idea,
    category: c.category,
    alternatives: c.alternatives,
    status: 'suggested',
    reason: c.reason,
    // registry rows are resolved from the registry; others keep their own display data
    item: c.source === 'registry' ? undefined : c.item,
    at: new Date().toISOString(),
  };
}

function commandText(i: Install): string | undefined {
  if (i.type === 'installer')
    return i.commands.map((c) => c.join(' ')).join(' && ');
  if (i.type === 'doc') return i.command;
  if (i.type === 'plugin') return `/plugin install ${i.plugin}`;
  return undefined;
}

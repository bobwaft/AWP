import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  FORM_TEMPLATES,
  loadPrompt,
  render,
  SECTION_SCHEMAS,
} from '@awp/prompts';
import {
  type AdapterId,
  type ChatMessage,
  type Critique,
  CritiqueInput,
  contrastFailures,
  type DesignTokens,
  FormRequest,
  type FormRequested,
  type FormResult,
  type FormValues,
  type PermissionRequest,
  PhasePlanInput,
  type ProjectState,
  parsePhasesMd,
  type Question,
  renderArchitectureMd,
  renderPhasesMd,
  type SpecPhase,
  type SpecSnapshot,
  type StackOption,
  StackOptionsInput,
  type Theme,
  ThemesInput,
  VerifyCommands,
  validatePhases,
  validateValues,
} from '@awp/protocol';
import { EngineError } from '../errors';
import type { Notify, RunManager } from '../runs';
import type { SpecStageConfig } from './config';
import {
  addRef,
  formValuesFromTokens,
  readRefs,
  renderDesignMd,
  renderTokensJson,
  tokensFromFormValues,
} from './design';
import { resolveFields } from './forms';
import { hashSections, scoreReadiness } from './readiness';

export type McpLauncher = (
  runId: string,
  opts: { figma: boolean },
) => Promise<{ path: string; env?: Record<string, string> }>;

export type SessionDeps = {
  root: string;
  cfg: SpecStageConfig;
  notify: Notify;
  runs: RunManager;
  adapter: AdapterId;
  model?: string;
  mcp?: McpLauncher;
  register: (runId: string) => void;
  /** True when a Figma token is stored (Design may then read linked Figma files). */
  hasFigma?: () => Promise<boolean>;
  getState: () => ProjectState;
  recordRound: () => Promise<unknown>;
};

type Persisted = {
  chat: ChatMessage[];
  critique: Critique | null;
  unsure: SpecSnapshot['unsure'];
  declined: string[];
  themes?: Theme[] | null;
  picked?: SpecSnapshot['picked'];
  stackOptions?: StackOption[] | null;
  stackPicked?: SpecSnapshot['stackPicked'];
  /** Hash of each required section when the critique was recorded. */
  hashes?: Record<string, string>;
};

type Deferred<T> = { resolve: (v: T) => void };

const now = () => new Date().toISOString();
// Phases that share the config's "synthesizer" slot (design themer, planning phaser).
const slot = (p: SpecPhase) =>
  p === 'themer' || p === 'phaser' ? 'synthesizer' : p;
const msg = (
  role: ChatMessage['role'],
  text: string,
  form?: ChatMessage['form'],
): ChatMessage => ({
  id: randomUUID(),
  role,
  text,
  ts: now(),
  form,
});

export class SpecSession {
  chat: ChatMessage[] = [];
  critique: Critique | null = null;
  unsure: SpecSnapshot['unsure'] = [];
  declined = new Set<string>();
  themes: Theme[] | null = null;
  stackOptions: StackOption[] | null = null;
  stackPicked: SpecSnapshot['stackPicked'] = null;
  private phasePlanSubmitted = false;
  picked: SpecSnapshot['picked'] = null;
  /** Theme chosen but not yet confirmed through the design form. */
  private pendingTheme: Theme | null = null;
  busy: SpecPhase | null = null;
  question: Question | null = null;
  form: FormRequested | null = null;
  permission: PermissionRequest | null = null;

  private qWait?: Deferred<string>;
  private formWait?: Deferred<FormResult>;
  private permWait?: Deferred<{ allow: boolean; message?: string }>;
  private formsThisTurn = 0;
  private critiqueThisRun = false;
  private hashes: Record<string, string> = {};
  private readiness: number | null = null;

  constructor(private d: SessionDeps) {}

  private get file() {
    return join(this.d.root, '.awp', 'spec', `${this.d.cfg.stage}.json`);
  }

  async load() {
    try {
      const p = JSON.parse(await readFile(this.file, 'utf8')) as Persisted;
      this.chat = p.chat ?? [];
      this.critique = p.critique ?? null;
      this.unsure = p.unsure ?? [];
      this.declined = new Set(p.declined ?? []);
      this.themes = p.themes ?? null;
      this.stackOptions = p.stackOptions ?? null;
      this.stackPicked = p.stackPicked ?? null;
      this.picked = p.picked ?? null;
      this.hashes = p.hashes ?? {};
    } catch {}
    // A form left open by an interrupted run is offered again as "Continue this form".
    try {
      const dir = join(this.d.root, '.awp', 'forms');
      for (const f of await readdir(dir)) {
        const rec = JSON.parse(await readFile(join(dir, f), 'utf8'));
        if (rec.status === 'open' && rec.stage === this.d.cfg.stage)
          this.form = {
            ...rec.form,
            prefill: rec.values ?? rec.form.prefill,
            orphaned: true,
          };
      }
    } catch {}
    await this.refreshReadiness(false);
    return this;
  }

  private async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    const p: Persisted = {
      chat: this.chat,
      critique: this.critique,
      unsure: this.unsure,
      declined: [...this.declined],
      themes: this.themes,
      picked: this.picked,
      stackOptions: this.stackOptions,
      stackPicked: this.stackPicked,
      hashes: this.hashes,
    };
    await writeFile(this.file, JSON.stringify(p, null, 2));
  }

  get blocking() {
    return this.critique?.questions.filter((q) => q.blocking).length ?? 0;
  }

  get rounds() {
    return this.d.getState().stages[this.d.cfg.stage].criticRounds;
  }

  snapshot(): SpecSnapshot {
    return {
      stage: this.d.cfg.stage,
      specFile: this.d.cfg.specFile,
      busy: this.busy,
      chat: this.chat,
      critique: this.critique,
      rounds: this.rounds,
      readiness: this.readiness,
      blocking: this.blocking,
      pending: {
        question: this.question,
        form: this.form,
        permission: this.permission,
      },
      unsure: this.unsure,
      declined: [...this.declined],
      themes: this.themes,
      picked: this.picked,
      stackOptions: this.stackOptions,
      stackPicked: this.stackPicked,
    };
  }

  /** Recomputes readiness from the spec on disk (no agent call); emits when it moved. */
  async refreshReadiness(emit = true) {
    const schema = SECTION_SCHEMAS[this.d.cfg.schemaId];
    if (!schema) return;
    const next = scoreReadiness(schema, await this.readSpec(), {
      readiness: this.critique?.readiness ?? {},
      hashes: this.hashes,
    });
    if (next === this.readiness) return;
    this.readiness = next;
    if (emit) this.emit();
  }

  private emit() {
    this.d.notify('spec.state', this.snapshot());
  }

  private async addMessage(m: ChatMessage) {
    this.chat.push(m);
    await this.persist();
    this.emit();
  }

  // ---- tools (called by the agent through the bridge) ----

  askUser(question: string, choices?: string[]): Promise<{ answer: string }> {
    const q: Question = { questionId: randomUUID(), text: question, choices };
    this.question = q;
    this.d.notify('question.asked', q);
    this.emit();
    return new Promise((resolve) => {
      this.qWait = { resolve: (answer) => resolve({ answer }) };
    });
  }

  async answerQuestion(questionId: string, answer: string) {
    if (!this.question || this.question.questionId !== questionId)
      throw new EngineError(
        'QUESTION_NOT_FOUND',
        'That question is no longer open',
      );
    const wait = this.qWait;
    this.question = null;
    this.qWait = undefined;
    await this.addMessage(msg('user', answer));
    wait?.resolve(answer);
  }

  async requestForm(raw: unknown): Promise<FormResult> {
    const parsed = FormRequest.safeParse(raw);
    if (!parsed.success)
      throw new EngineError(
        'FORM_SCHEMA_INVALID',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    const req = parsed.data;
    if (req.templateId && this.declined.has(req.templateId))
      throw new EngineError(
        'FORM_DECLINED',
        'The user declined this form. Ask in chat instead.',
      );
    if (this.formsThisTurn >= 1)
      throw new EngineError(
        'FORM_LIMIT',
        'Only one form per turn. Ask the rest in chat.',
      );
    const fields = resolveFields(req);
    this.formsThisTurn++;
    const form: FormRequested = {
      formId: randomUUID(),
      title: req.title,
      templateId: req.templateId,
      fields,
      prefill: req.prefill,
      aiFilled: Object.keys(req.prefill ?? {}),
      orphaned: false,
    };
    this.form = form;
    await this.saveFormFile(form, 'open');
    this.d.notify('form.requested', form);
    this.emit();
    return new Promise((resolve) => {
      this.formWait = { resolve };
    });
  }

  private async saveFormFile(
    form: FormRequested,
    status: 'open' | 'done',
    values?: FormValues,
  ) {
    const dir = join(this.d.root, '.awp', 'forms');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${form.formId}.json`),
      JSON.stringify(
        { status, stage: this.d.cfg.stage, form, values },
        null,
        2,
      ),
    );
  }

  private openForm(formId: string) {
    if (!this.form || this.form.formId !== formId)
      throw new EngineError('FORM_NOT_FOUND', 'That form is no longer open');
    return this.form;
  }

  async saveDraft(formId: string, values: FormValues) {
    await this.saveFormFile(this.openForm(formId), 'open', values);
  }

  async submitForm(formId: string, values: FormValues, unsure: string[]) {
    const form = this.openForm(formId);
    const errors = validateValues(form.fields, values, unsure);
    if (Object.keys(errors).length)
      throw new EngineError(
        'FORM_INVALID',
        'Some fields need attention',
        JSON.stringify(errors),
      );
    // Design forms opened by AWP are checked before anything is consumed, so the user can fix and resubmit.
    let designTokens: DesignTokens | undefined;
    if (form.templateId === 'design_schema' && !this.formWait) {
      designTokens = tokensFromFormValues(values);
      const fail = contrastFailures(designTokens);
      if (fail.length)
        throw new EngineError(
          'DESIGN_CONTRAST',
          fail.join('; '),
          'Adjust the colors.',
        );
    }
    // "Not sure" fields feed the critic; fields answered this time are no longer unsure.
    const answered = new Set(form.fields.map((f) => f.id));
    this.unsure = [
      ...this.unsure.filter((u) => !answered.has(u.fieldId)),
      ...form.fields
        .filter((f) => unsure.includes(f.id))
        .map((f) => ({ fieldId: f.id, label: f.label, fills: f.fills })),
    ];
    const wait = this.formWait;
    this.form = null;
    this.formWait = undefined;
    await this.saveFormFile(form, 'done', values);
    await this.addMessage(
      msg('form', `Submitted: ${form.title}`, {
        title: form.title,
        templateId: form.templateId,
        values,
      }),
    );
    if (designTokens) {
      // Opened by AWP after a theme pick (no agent is waiting): write the design docs.
      await this.addUrlRefs(values.references);
      await this.applyDesign(designTokens, this.pendingTheme);
      void this.critiqueOnly();
    } else if (wait) wait.resolve({ status: 'submitted', values, unsure });
    // Interrupted run: the submission starts a new turn as structured data.
    else if (!this.busy)
      void this.startCycle(
        `Form submitted (${form.title}): ${JSON.stringify({ values, unsure })}`,
        false,
      );
  }

  async declineForm(formId: string) {
    const form = this.openForm(formId);
    if (form.templateId) this.declined.add(form.templateId);
    const wait = this.formWait;
    this.form = null;
    this.formWait = undefined;
    await this.saveFormFile(form, 'done');
    await this.persist();
    this.emit();
    wait?.resolve({ status: 'declined' });
  }

  /** "Ask about this form": answer in chat, then the agent re-sends the form prefilled with `draft`. */
  async askAboutForm(formId: string, text: string, draft: FormValues) {
    const form = this.openForm(formId);
    const wait = this.formWait;
    this.form = null;
    this.formWait = undefined;
    await this.saveFormFile(form, 'done', draft);
    await this.addMessage(msg('user', text));
    if (wait) wait.resolve({ status: 'question', text, draft });
    else if (!this.busy)
      void this.startCycle(
        `Question about the "${form.title}" form: ${text}\nDraft: ${JSON.stringify(draft)}`,
        false,
      );
  }

  async submitCritique(raw: unknown) {
    const parsed = CritiqueInput.safeParse(raw);
    if (!parsed.success)
      throw new EngineError(
        'CRITIQUE_INVALID',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    this.critiqueThisRun = true;
    this.critique = {
      round: this.rounds,
      questions: parsed.data.questions.map((q) => ({ id: randomUUID(), ...q })),
      readiness: parsed.data.readiness,
    };
    const schema = SECTION_SCHEMAS[this.d.cfg.schemaId];
    this.hashes = schema ? hashSections(schema, await this.readSpec()) : {};
    await this.refreshReadiness(false);
    await this.persist();
    this.emit();
    // One line so the chat agrees with the Open questions panel.
    const qs = this.critique.questions;
    if (qs.length) {
      const optional = qs.length - this.blocking;
      const head = `Review ${this.rounds}/${this.d.cfg.maxRounds}:`;
      await this.addMessage(
        msg(
          'assistant',
          this.blocking
            ? `${head} ${this.blocking} blocking, ${optional} optional open question${optional === 1 ? '' : 's'} (see Open questions).`
            : `${head} nothing blocking, ${optional} optional open question${optional === 1 ? '' : 's'} (see Open questions).`,
        ),
      );
    }
    return { ok: true, blocking: this.blocking };
  }

  requestPermission(
    tool: string,
    input: unknown,
  ): Promise<{ allow: boolean; message?: string }> {
    const p: PermissionRequest = { requestId: randomUUID(), tool, input };
    this.permission = p;
    this.d.notify('permission.requested', p);
    this.emit();
    return new Promise((resolve) => {
      this.permWait = { resolve };
    });
  }

  decidePermission(requestId: string, allow: boolean, message?: string) {
    if (!this.permission || this.permission.requestId !== requestId)
      throw new EngineError(
        'PERMISSION_NOT_FOUND',
        'That request is no longer open',
      );
    const wait = this.permWait;
    this.permission = null;
    this.permWait = undefined;
    this.emit();
    wait?.resolve({ allow, message });
  }

  // ---- planning stage: stack options, phase plan ----

  async submitStackOptions(raw: unknown) {
    const parsed = StackOptionsInput.safeParse(raw);
    if (!parsed.success)
      throw new EngineError(
        'STACK_OPTIONS_INVALID',
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    if (
      new Set(parsed.data.options.map((o) => o.id)).size !==
      parsed.data.options.length
    )
      throw new EngineError(
        'STACK_OPTIONS_INVALID',
        'Option ids must be unique',
      );
    this.stackOptions = parsed.data.options;
    await this.persist();
    this.emit();
    return { ok: true, count: parsed.data.options.length };
  }

  async submitPhasePlan(raw: unknown) {
    const parsed = PhasePlanInput.safeParse(raw);
    if (!parsed.success)
      throw new EngineError(
        'PLAN_INVALID',
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const errors = validatePhases(parsed.data.phases);
    if (errors.length)
      throw new EngineError(
        'PLAN_INVALID',
        errors.join('; '),
        'Fix these and resubmit.',
      );
    await this.savePhases(parsed.data.phases);
    this.phasePlanSubmitted = true;
    return { ok: true, phases: parsed.data.phases.length };
  }

  /** Writes PHASES.md from structured phases (agent submit, or the phase barrel's edits). */
  async savePhases(phases: Parameters<typeof renderPhasesMd>[0]) {
    await mkdir(join(this.d.root, 'docs'), { recursive: true });
    await writeFile(
      join(this.d.root, 'docs', 'PHASES.md'),
      renderPhasesMd(phases),
    );
    this.emit();
  }

  /** Picks a stack: writes ARCHITECTURE.md (with the verify commands), then plans phases and critiques. */
  async pickStack(
    optionId: string,
    edits?: { verify?: Partial<VerifyCommands>; notes?: string },
  ) {
    if (this.busy)
      throw new EngineError(
        'SPEC_BUSY',
        'AWP is still working on the last message',
      );
    const option = this.stackOptions?.find((o) => o.id === optionId);
    if (!option)
      throw new EngineError(
        'STACK_NOT_FOUND',
        'That option is not in the current proposals',
      );
    const verify = VerifyCommands.safeParse({
      ...option.verify,
      ...(edits?.verify ?? {}),
    });
    if (!verify.success)
      throw new EngineError(
        'VERIFY_INVALID',
        'Every verify command is required (install, typecheck, lint, test, build)',
        verify.error.issues.map((i) => i.path.join('.')).join(', '),
      );
    this.busy = 'phaser'; // claim before any await so a double click cannot start two planners
    await this.writeBase();
    await mkdir(join(this.d.root, 'docs'), { recursive: true });
    await writeFile(
      join(this.d.root, this.d.cfg.specFile),
      renderArchitectureMd({
        projectName: this.d.getState().project.name,
        option,
        verify: verify.data,
        notes: edits?.notes,
      }),
    );
    this.stackPicked = {
      optionId: option.id,
      name: option.name,
      verify: verify.data,
    };
    await this.persist();
    this.emit();
    this.busy = 'phaser';
    this.emit();
    void this.phaserAndCritic('', randomUUID()).catch(() => {});
  }

  /** Phase planner, then the critic once a valid PHASES.md exists. Leaves `busy` cleared. */
  private async phaserAndCritic(text: string, runId?: string) {
    try {
      this.busy = 'phaser';
      this.emit();
      this.phasePlanSubmitted = false;
      await this.runPhase('phaser', text, runId);
      if (!this.phasePlanSubmitted) {
        await this.addMessage(
          msg(
            'assistant',
            'No phase plan came back. Send a message to try again.',
          ),
        );
        return;
      }
      if (this.rounds < this.d.cfg.maxRounds) {
        this.busy = 'critic';
        this.emit();
        await this.d.recordRound();
        this.critiqueThisRun = false;
        await this.runPhase('critic', text);
        if (!this.critiqueThisRun)
          await this.addMessage(
            msg(
              'assistant',
              'The review step did not report. Send another message to retry.',
            ),
          );
      }
    } catch (e) {
      await this.addMessage(
        msg(
          'assistant',
          `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    } finally {
      this.endBusy();
      this.emit();
    }
  }

  /** Extra gate conditions for Planning; returns a reason or null. */
  async planGateProblem(): Promise<string | null> {
    if (this.d.cfg.mode !== 'planning') return null;
    if (!this.stackPicked) return 'Pick a stack first';
    const text = await readFile(
      join(this.d.root, 'docs', 'PHASES.md'),
      'utf8',
    ).catch(() => '');
    const { errors } = parsePhasesMd(text);
    return errors.length ? `PHASES.md has problems: ${errors[0]}` : null;
  }

  // ---- design stage: themes, picking, documents ----

  async submitThemes(raw: unknown) {
    const parsed = ThemesInput.safeParse(raw);
    if (!parsed.success)
      throw new EngineError(
        'THEMES_INVALID',
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const { themes } = parsed.data;
    if (new Set(themes.map((t) => t.id)).size !== themes.length)
      throw new EngineError('THEMES_INVALID', 'Theme ids must be unique');
    const bad = themes.flatMap((t) =>
      contrastFailures(t.tokens).map((f) => `${t.name}: ${f}`),
    );
    if (bad.length)
      throw new EngineError(
        'THEME_CONTRAST',
        bad.join('; '),
        'Fix the colors and resubmit.',
      );
    this.themes = themes;
    await this.persist();
    this.emit();
    return { ok: true, count: themes.length };
  }

  /** Asks the themer for fresh proposals (optionally with feedback on the last ones). */
  async proposeThemes(feedback = ''): Promise<void> {
    if (this.busy)
      throw new EngineError(
        'SPEC_BUSY',
        'AWP is still working on the last message',
      );
    this.busy = 'themer';
    this.emit();
    void (async () => {
      try {
        this.themes = null;
        const r = await this.runPhase('themer', feedback);
        if (r.status === 'error' || !this.themes)
          await this.addMessage(
            msg(
              'assistant',
              'No themes came back. Try again, or tell me more about the look you want.',
            ),
          );
      } catch (e) {
        await this.addMessage(
          msg(
            'assistant',
            `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      } finally {
        this.endBusy();
        await this.persist();
        this.emit();
      }
    })();
  }

  /** Picks a theme. With `tweaks` the docs are written now; otherwise AWP opens the design form prefilled with it. */
  async pickTheme(themeId: string, tweaks?: Record<string, unknown>) {
    if (this.busy || this.formWait)
      throw new EngineError(
        'SPEC_BUSY',
        'AWP is still working; finish or answer the open form first',
      );
    const theme = this.themes?.find((t) => t.id === themeId);
    if (!theme)
      throw new EngineError(
        'THEME_NOT_FOUND',
        'That theme is not in the current proposals',
      );
    this.pendingTheme = theme;
    const values = { ...formValuesFromTokens(theme.tokens), ...(tweaks ?? {}) };
    if (tweaks) {
      await this.applyDesign(tokensFromFormValues(values), theme);
      void this.critiqueOnly();
      return;
    }
    const template = FORM_TEMPLATES.design_schema;
    const form: FormRequested = {
      formId: randomUUID(),
      title: `Design tokens: ${theme.name}`,
      templateId: 'design_schema',
      fields: resolveFields({
        templateId: 'design_schema',
        title: template.title,
      }),
      prefill: values,
      aiFilled: Object.keys(values),
      orphaned: false,
    };
    this.form = form;
    await this.saveFormFile(form, 'open');
    this.d.notify('form.requested', form);
    this.emit();
  }

  private async applyDesign(tokens: DesignTokens, theme: Theme | null) {
    const fail = contrastFailures(tokens);
    if (fail.length)
      throw new EngineError(
        'DESIGN_CONTRAST',
        fail.join('; '),
        'Adjust the colors.',
      );
    const name = theme?.name ?? this.picked?.name ?? 'Custom';
    const refs = await readRefs(this.d.root);
    const docs = join(this.d.root, 'docs');
    await mkdir(join(docs, 'design'), { recursive: true });
    await writeFile(
      join(docs, 'design', 'tokens.json'),
      renderTokensJson(name, tokens),
    );
    await this.writeBase();
    await writeFile(
      join(this.d.root, this.d.cfg.specFile),
      renderDesignMd({
        projectName: this.d.getState().project.name,
        themeName: name,
        description: theme?.description ?? 'Customised design tokens.',
        tokens,
        refs,
      }),
    );
    this.picked = {
      themeId: theme?.id ?? this.picked?.themeId ?? 'custom',
      name,
      tokens,
    };
    this.pendingTheme = null;
    await this.persist();
    this.emit();
  }

  private async addUrlRefs(list: unknown) {
    if (!Array.isArray(list)) return;
    for (const row of list as { url?: string }[])
      if (row?.url) await addRef(this.d.root, row.url).catch(() => {});
  }

  /** Runs just the critic (after the design docs were written). */
  private async critiqueOnly() {
    if (this.busy || this.rounds >= this.d.cfg.maxRounds) return;
    this.busy = 'critic';
    this.emit();
    try {
      await this.d.recordRound();
      this.critiqueThisRun = false;
      await this.runPhase('critic', '');
    } catch (e) {
      await this.addMessage(
        msg(
          'assistant',
          `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    } finally {
      this.endBusy();
      this.emit();
    }
  }

  // ---- the interview -> synthesize -> critique cycle ----

  /** Adds the user's message and runs a full cycle in the background. Returns the first run id. */
  async send(text: string, attachments: string[] = []): Promise<string> {
    if (this.busy)
      throw new EngineError(
        'SPEC_BUSY',
        'AWP is still working on the last message',
      );
    this.busy = 'interviewer'; // claim synchronously so a second send cannot slip past the check
    const shown = attachments.length
      ? `${text}\n\nAttached: ${attachments.join(', ')}`
      : text;
    try {
      await this.addMessage(msg('user', shown));
    } catch (e) {
      this.endBusy();
      throw e;
    }
    return this.startCycle(shown, false);
  }

  /** Clears busy and every wait that belonged to the finished run; an open agent form becomes an orphan. */
  private endBusy() {
    this.busy = null;
    this.question = null;
    this.qWait = undefined;
    this.permission = null;
    this.permWait = undefined;
    if (this.form && this.formWait) {
      this.form = { ...this.form, orphaned: true };
      this.formWait = undefined;
    }
  }

  private startCycle(text: string, addUser: boolean): string {
    const runId = randomUUID();
    this.busy = 'interviewer';
    this.emit();
    void (addUser ? this.addMessage(msg('user', text)) : Promise.resolve())
      .then(() => this.cycle(runId, text))
      .catch(() => {});
    return runId;
  }

  private async cycle(firstRunId: string, text: string) {
    try {
      this.formsThisTurn = 0;
      if (this.d.cfg.mode === 'planning' && this.stackPicked) {
        // Stack already chosen: further messages are feedback on the phase plan.
        await this.phaserAndCritic(text, firstRunId);
        return;
      }
      const interview = await this.runPhase('interviewer', text, firstRunId);
      if (interview.status === 'error') {
        await this.addMessage(
          msg(
            'assistant',
            'The agent stopped with an error. Check Setup, then try again.',
          ),
        );
        return;
      }
      if (interview.text)
        await this.addMessage(msg('assistant', interview.text));
      if (interview.status === 'stopped') return;

      if (this.d.cfg.mode === 'design') {
        // Themes are proposed once; the critic waits until a theme is picked and the docs exist.
        if (!this.themes) {
          this.busy = 'themer';
          this.emit();
          await this.runPhase('themer', text);
        }
        if (!this.picked) return;
      } else if (this.d.cfg.mode === 'planning') {
        // The architect (interviewer slot) proposes options; the critic waits for a pick + a plan.
        return;
      } else {
        this.busy = 'synthesizer';
        this.emit();
        await this.writeBase();
        await this.runPhase('synthesizer', text);
        await this.refreshReadiness();
      }

      if (this.rounds < this.d.cfg.maxRounds) {
        this.busy = 'critic';
        this.emit();
        await this.d.recordRound();
        this.critiqueThisRun = false;
        await this.runPhase('critic', text);
        if (!this.critiqueThisRun)
          await this.addMessage(
            msg(
              'assistant',
              'The review step did not report. Send another message to retry.',
            ),
          );
      }
    } catch (e) {
      await this.addMessage(
        msg(
          'assistant',
          `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    } finally {
      this.endBusy();
      this.question = null;
      this.qWait = undefined;
      // A form still open when the run ends is kept as an orphan to continue later.
      if (this.form && this.formWait) {
        this.form = { ...this.form, orphaned: true };
        this.formWait = undefined;
      }
      this.emit();
    }
  }

  private async readSpec() {
    return readFile(join(this.d.root, this.d.cfg.specFile), 'utf8').catch(
      () => '',
    );
  }

  /** Snapshot of the spec before the AI edits it, so the UI can diff and revert hunks. */
  private async writeBase() {
    const base = join(
      this.d.root,
      '.awp',
      'spec',
      `${this.d.cfg.stage}.base.md`,
    );
    await mkdir(dirname(base), { recursive: true });
    await writeFile(base, await this.readSpec());
  }

  private async promptFor(phase: SpecPhase) {
    const id = this.d.cfg.prompts[slot(phase)];
    const override = await readFile(
      join(this.d.root, '.awp', 'prompts', `${id}.md`),
      'utf8',
    ).catch(() => undefined);
    return loadPrompt(id, override);
  }

  private async vars(text: string) {
    const schema = SECTION_SCHEMAS[this.d.cfg.schemaId];
    const transcript = this.chat
      .slice(-30)
      .map((m) =>
        m.role === 'user'
          ? `User: ${m.text}`
          : m.role === 'form'
            ? `User submitted form "${m.form?.title}": ${JSON.stringify(m.form?.values)}`
            : `AWP: ${m.text}`,
      )
      .join('\n');
    const refs = await readRefs(this.d.root);
    const refLines = [
      ...refs.files.map((f) => `- file: ${f.path}`),
      ...refs.links.map(
        (l) => `- ${l.kind === 'figma' ? 'Figma file' : 'link'}: ${l.url}`,
      ),
    ];
    const prd = await readFile(
      join(this.d.root, 'docs', 'PRD.md'),
      'utf8',
    ).catch(() => '');
    return {
      prd: prd.trim() || '(no PRD yet)',
      design:
        (
          await readFile(join(this.d.root, 'docs', 'DESIGN.md'), 'utf8').catch(
            () => '',
          )
        ).trim() || '(none)',
      architecture:
        (
          await readFile(
            join(this.d.root, 'docs', 'ARCHITECTURE.md'),
            'utf8',
          ).catch(() => '')
        ).trim() || '(none)',
      phases:
        (
          await readFile(join(this.d.root, 'docs', 'PHASES.md'), 'utf8').catch(
            () => '',
          )
        ).trim() || '(none)',
      refs: refLines.join('\n') || '(none)',
      figma: (await this.useFigma())
        ? '\nFigma is connected: you may read the linked Figma files through the figma MCP tools.\n'
        : '',
      spec: (await this.readSpec()).trim() || '(empty: no document yet)',
      chat: transcript || '(no messages yet)',
      open_questions:
        this.critique?.questions
          .map((q) => `- [${q.blocking ? 'blocking' : 'optional'}] ${q.text}`)
          .join('\n') || '(none)',
      unsure:
        this.unsure
          .map((u) => `- ${u.label}${u.fills ? ` (fills ${u.fills})` : ''}`)
          .join('\n') || '(none)',
      message: text,
      declined: [...this.declined].join(', ') || 'none',
      sections: schema.sections.map((s) => s.title).join(', '),
      required_sections: schema.sections
        .filter((s) => s.required)
        .map((s) => `${s.id}: ${s.title}`)
        .join(', '),
      round: String(this.rounds + 1),
    };
  }

  /** Figma is used only when a token is stored and the user linked a Figma file. */
  private async useFigma() {
    if (this.d.cfg.mode !== 'design' || !(await this.d.hasFigma?.()))
      return false;
    return (await readRefs(this.d.root)).links.some((l) => l.kind === 'figma');
  }

  private async runPhase(
    phase: SpecPhase,
    text: string,
    runId: string = randomUUID(),
  ) {
    const prompt = render(
      (await this.promptFor(phase)).body,
      await this.vars(text),
    );
    this.d.register(runId);
    const figma = phase === 'themer' && (await this.useFigma());
    const mcp = await this.d.mcp?.(runId, { figma });
    const mcpConfigPath = mcp?.path;
    const toolsKey = slot(phase);
    const { done } = this.d.runs.exec({
      runId,
      adapter: this.d.adapter,
      cwd: this.d.root,
      prompt,
      model: this.d.model,
      allowedTools: [
        ...this.d.cfg.tools[toolsKey],
        ...(figma ? ['mcp__figma'] : []),
      ],
      env: mcp?.env,
      mcpConfigPath,
      permissionPromptTool: mcpConfigPath
        ? 'mcp__awp__approve_permission'
        : undefined,
      maxTurns: 20,
    });
    return done;
  }
}

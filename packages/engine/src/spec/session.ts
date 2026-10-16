import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadPrompt, render, SECTION_SCHEMAS } from '@awp/prompts';
import {
  type AdapterId,
  type ChatMessage,
  type Critique,
  CritiqueInput,
  FormRequest,
  type FormRequested,
  type FormResult,
  type FormValues,
  type PermissionRequest,
  type ProjectState,
  type Question,
  type SpecPhase,
  type SpecSnapshot,
  validateValues,
} from '@awp/protocol';
import { EngineError } from '../errors';
import type { Notify, RunManager } from '../runs';
import type { SpecStageConfig } from './config';
import { resolveFields } from './forms';

export type McpLauncher = (runId: string) => Promise<string>; // returns mcp config path

export type SessionDeps = {
  root: string;
  cfg: SpecStageConfig;
  notify: Notify;
  runs: RunManager;
  adapter: AdapterId;
  model?: string;
  mcp?: McpLauncher;
  register: (runId: string) => void;
  getState: () => ProjectState;
  recordRound: () => Promise<unknown>;
};

type Persisted = {
  chat: ChatMessage[];
  critique: Critique | null;
  unsure: SpecSnapshot['unsure'];
  declined: string[];
};

type Deferred<T> = { resolve: (v: T) => void };

const now = () => new Date().toISOString();
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
  busy: SpecPhase | null = null;
  question: Question | null = null;
  form: FormRequested | null = null;
  permission: PermissionRequest | null = null;

  private qWait?: Deferred<string>;
  private formWait?: Deferred<FormResult>;
  private permWait?: Deferred<{ allow: boolean; message?: string }>;
  private formsThisTurn = 0;
  private critiqueThisRun = false;

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
    } catch {}
    // A form left open by an interrupted run is offered again as "Continue this form".
    try {
      const dir = join(this.d.root, '.awp', 'forms');
      for (const f of await readdir(dir)) {
        const rec = JSON.parse(await readFile(join(dir, f), 'utf8'));
        if (rec.status === 'open')
          this.form = {
            ...rec.form,
            prefill: rec.values ?? rec.form.prefill,
            orphaned: true,
          };
      }
    } catch {}
    return this;
  }

  private async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    const p: Persisted = {
      chat: this.chat,
      critique: this.critique,
      unsure: this.unsure,
      declined: [...this.declined],
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
    const scores = Object.values(this.critique?.readiness ?? {});
    return {
      stage: this.d.cfg.stage,
      specFile: this.d.cfg.specFile,
      busy: this.busy,
      chat: this.chat,
      critique: this.critique,
      rounds: this.rounds,
      readiness: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      blocking: this.blocking,
      pending: {
        question: this.question,
        form: this.form,
        permission: this.permission,
      },
      unsure: this.unsure,
      declined: [...this.declined],
    };
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
      JSON.stringify({ status, form, values }, null, 2),
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
    if (wait) wait.resolve({ status: 'submitted', values, unsure });
    // Interrupted run: the submission starts a new turn as structured data.
    else
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
    else
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
    await this.persist();
    this.emit();
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

  // ---- the interview -> synthesize -> critique cycle ----

  /** Adds the user's message and runs a full cycle in the background. Returns the first run id. */
  async send(text: string, attachments: string[] = []): Promise<string> {
    if (this.busy)
      throw new EngineError(
        'SPEC_BUSY',
        'AWP is still working on the last message',
      );
    const shown = attachments.length
      ? `${text}\n\nAttached: ${attachments.join(', ')}`
      : text;
    await this.addMessage(msg('user', shown));
    return this.startCycle(shown, false);
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

      this.busy = 'synthesizer';
      this.emit();
      await this.writeBase();
      await this.runPhase('synthesizer', text);

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
      this.busy = null;
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
    const id = this.d.cfg.prompts[phase];
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
    return {
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
    const mcpConfigPath = await this.d.mcp?.(runId);
    const { done } = this.d.runs.exec({
      runId,
      adapter: this.d.adapter,
      cwd: this.d.root,
      prompt,
      model: this.d.model,
      allowedTools: this.d.cfg.tools[phase],
      mcpConfigPath,
      permissionPromptTool: mcpConfigPath
        ? 'mcp__awp__approve_permission'
        : undefined,
      maxTurns: 20,
    });
    return done;
  }
}

// biome-ignore-all lint/correctness/useYield: test scripts only call tools; the adapter wrapper yields events
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, RunRequest, SpecSnapshot } from '@awp/protocol';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { buildArgs } from '../adapters/claude';
import { FakeAdapter } from '../adapters/fake';
import { createHandlers } from '../handlers';
import { toolList } from '../mcp';
import { engineCommand, startBridge } from './bridge';
import type { SpecService } from './service';

type Script = (
  req: RunRequest,
  svc: SpecService,
  phase: 'interviewer' | 'synthesizer' | 'critic',
) => AsyncGenerator<AgentEvent>;

const phaseOf = (req: RunRequest) =>
  req.allowedTools?.includes('mcp__awp__submit_critique')
    ? 'critic'
    : req.allowedTools?.includes('mcp__awp__ask_user')
      ? 'interviewer'
      : 'synthesizer';

let dir: string;
let notes: { m: string; p: any }[];
let h: ReturnType<typeof createHandlers>;
let svc: SpecService;
const prompts: Record<string, string[]> = {
  interviewer: [],
  synthesizer: [],
  critic: [],
};

async function setup(script: Script) {
  dir = await mkdtemp(join(tmpdir(), 'awp-spec-'));
  notes = [];
  for (const k of Object.keys(prompts)) prompts[k] = [];
  h = createHandlers(
    (m, p) => notes.push({ m, p }),
    () =>
      new FakeAdapter({
        script: async function* (req) {
          const phase = phaseOf(req);
          prompts[phase].push(req.prompt);
          yield { type: 'session', sessionId: 's' };
          yield* script(req, svc, phase);
          yield { type: 'done', status: 'success' };
        },
      }),
    { specAdapter: 'fake', withMcp: false },
  );
  await h._projects.create(join(dir, 'p'), 'p');
  svc = await h._spec();
}

const call = (name: string, params: unknown) => (h as any)[name](params);
const snap = async (): Promise<SpecSnapshot> =>
  call('spec.get', { stage: 'ideation' });
const idle = async () => {
  for (let i = 0; i < 300; i++) {
    const s = await snap();
    if (!s.busy) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('still busy');
};
const waitFor = async <T>(f: () => T | undefined | false) => {
  for (let i = 0; i < 300; i++) {
    const v = f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timeout');
};
const send = (text: string) => call('chat.send', { stage: 'ideation', text });

// A critic that reports blocking questions for the first `blockRounds` rounds.
const standard = (blockRounds: number): Script =>
  async function* (req, s, phase) {
    if (phase === 'interviewer')
      yield { type: 'message', role: 'assistant', text: 'Got it.' };
    if (phase === 'synthesizer') {
      await writeFile(
        join(req.cwd, 'docs', 'PRD.md'),
        '# PRD\n## Problem\nA real problem worth solving.\n',
      );
      yield { type: 'message', role: 'assistant', text: 'Updated.' };
    }
    if (phase === 'critic') {
      const round = (await snap()).rounds;
      await s.callTool(req.runId, 'submit_critique', {
        questions:
          round <= blockRounds
            ? [
                { text: 'Who pays?', blocking: true },
                { text: 'Colors?', blocking: false },
              ]
            : [],
        readiness: { problem: 80, users: round <= blockRounds ? 20 : 90 },
      });
    }
  };

afterEach(() => h?._projects.close());

test('full ideation run: blocking question, then zero blocking, then stage completes', async () => {
  await setup(standard(1));
  await expect(
    call('stage.complete', { stage: 'ideation' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  await send('A todo app for dogs');
  let s = await idle();
  expect(s.rounds).toBe(1);
  expect(s.blocking).toBe(1);
  expect(s.readiness).toBe(50);
  expect(s.chat.map((m) => m.role)).toEqual(['user', 'assistant']);
  await expect(
    call('stage.complete', { stage: 'ideation' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  expect(await readFile(join(dir, 'p', 'docs', 'PRD.md'), 'utf8')).toContain(
    '## Problem',
  );
  expect(existsSync(join(dir, 'p', '.awp', 'spec', 'ideation.base.md'))).toBe(
    true,
  );

  await send('The owner pays');
  s = await idle();
  expect(s.blocking).toBe(0);
  const done = await call('stage.complete', { stage: 'ideation' });
  expect(done.stages.ideation.status).toBe('complete');
  expect(done.stages.design.status).toBe('active');
});

test('critic round cap: after 3 rounds no more critiques; complete anyway needs a reason', async () => {
  await setup(standard(99));
  for (const t of ['one', 'two', 'three', 'four']) {
    await send(t);
    await idle();
  }
  const s = await snap();
  expect(s.rounds).toBe(3);
  expect(prompts.critic).toHaveLength(3);
  expect(s.blocking).toBeGreaterThan(0);
  await expect(
    call('stage.complete', { stage: 'ideation' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  await expect(
    call('stage.complete', { stage: 'ideation', overrideReason: '  ' }),
  ).rejects.toMatchObject({ code: 'GATE_BLOCKED' });
  const done = await call('stage.complete', {
    stage: 'ideation',
    overrideReason: 'Pricing decided later',
  });
  expect(done.stages.ideation.override.reason).toBe('Pricing decided later');
});

test('send while busy is refused', async () => {
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer')
      await s.callTool(req.runId, 'ask_user', { question: 'Q?' });
  });
  await send('hi');
  await expect(send('again')).rejects.toMatchObject({ code: 'SPEC_BUSY' });
  const q = await waitFor(() => notes.find((n) => n.m === 'question.asked')?.p);
  await call('question.answer', { questionId: q.questionId, answer: 'done' });
  await idle();
});

test('ask_user blocks until answered; the answer reaches the agent and the chat', async () => {
  let got: unknown;
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer')
      got = await s.callTool(req.runId, 'ask_user', {
        question: 'Who?',
        choices: ['devs', 'ops'],
      });
  });
  await send('hi');
  const q = await waitFor(() => notes.find((n) => n.m === 'question.asked')?.p);
  expect(q).toMatchObject({ text: 'Who?', choices: ['devs', 'ops'] });
  expect((await snap()).pending.question?.questionId).toBe(q.questionId);
  await call('question.answer', { questionId: q.questionId, answer: 'devs' });
  const s = await idle();
  expect(got).toEqual({ answer: 'devs' });
  expect(s.chat.some((m) => m.role === 'user' && m.text === 'devs')).toBe(true);
  expect(s.pending.question).toBeNull();
});

test('forms: prefill is flagged, validation rejects, submit lands as summary, second form is limited', async () => {
  let result: any;
  let second: any;
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer') {
      result = await s.callTool(req.runId, 'request_form', {
        templateId: 'feature_spec',
        title: 'Feature spec',
        prefill: { name: 'Walks' },
      });
      second = await s
        .callTool(req.runId, 'request_form', {
          templateId: 'bug_report',
          title: 'Bug',
        })
        .catch((e) => e);
    }
  });
  await send('add a feature');
  const f = await waitFor(() => notes.find((n) => n.m === 'form.requested')?.p);
  expect(f.aiFilled).toEqual(['name']);
  expect(f.fields.map((x: any) => x.id)).toContain('criteria');
  await expect(
    call('form.submit', {
      formId: f.formId,
      values: { name: 'Walks' },
      unsure: [],
    }),
  ).rejects.toMatchObject({ code: 'FORM_INVALID' });
  const values = {
    name: 'Walks',
    story: 'As a dog owner...',
    priority: 'must',
    criteria: [{ criterion: 'Logs distance' }],
  };
  await call('form.saveDraft', { formId: f.formId, values });
  await call('form.submit', { formId: f.formId, values, unsure: [] });
  const s = await idle();
  expect(result).toMatchObject({ status: 'submitted', values });
  expect(second.code).toBe('FORM_LIMIT');
  expect(s.chat.find((m) => m.role === 'form')?.form).toMatchObject({
    title: 'Feature spec',
    values,
  });
  expect(s.pending.form).toBeNull();
});

test('forms: "Not sure" skips required and feeds the critic', async () => {
  let r1: any;
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer' && prompts.interviewer.length === 1)
      r1 = await s.callTool(req.runId, 'request_form', {
        templateId: 'feature_spec',
        title: 'Feature spec',
      });
  });
  await send('one');
  const f = await waitFor(() => notes.find((n) => n.m === 'form.requested')?.p);
  await call('form.submit', {
    formId: f.formId,
    values: { name: 'X', story: 's', priority: 'must' },
    unsure: ['criteria'],
  });
  let s = await idle();
  expect(r1.unsure).toEqual(['criteria']);
  expect(s.unsure[0]).toMatchObject({
    fieldId: 'criteria',
    fills: 'prd.features',
  });
  expect(prompts.critic.at(-1)).toContain('Acceptance criteria');
  s = await snap();
});

test('declined template is refused with FORM_DECLINED', async () => {
  let r: any;
  await setup(async function* (req, s, phase) {
    if (phase !== 'interviewer') return;
    if (prompts.interviewer.length === 1)
      await s.callTool(req.runId, 'request_form', {
        templateId: 'bug_report',
        title: 'Bug',
      });
    else
      r = await s
        .callTool(req.runId, 'request_form', {
          templateId: 'bug_report',
          title: 'Bug',
        })
        .catch((e) => e);
  });
  await send('one');
  const f = await waitFor(() => notes.find((n) => n.m === 'form.requested')?.p);
  await call('form.decline', { formId: f.formId });
  const s = await idle();
  expect(s.declined).toEqual(['bug_report']);
  await send('two');
  await idle();
  expect(r.code).toBe('FORM_DECLINED');
  expect(prompts.interviewer.at(-1)).toContain('bug_report');
});

test('"Ask about this form" returns the draft to the agent', async () => {
  let r: any;
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer')
      r = await s.callTool(req.runId, 'request_form', {
        templateId: 'feature_spec',
        title: 'F',
      });
  });
  await send('x');
  const f = await waitFor(() => notes.find((n) => n.m === 'form.requested')?.p);
  await call('form.ask', {
    formId: f.formId,
    text: 'What is priority?',
    draft: { name: 'A' },
  });
  const s = await idle();
  expect(r).toEqual({
    status: 'question',
    text: 'What is priority?',
    draft: { name: 'A' },
  });
  expect(s.chat.some((m) => m.text === 'What is priority?')).toBe(true);
});

test('an interrupted run keeps the form as an orphan; submitting it starts a new turn', async () => {
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer' && prompts.interviewer.length === 1) {
      void s
        .callTool(req.runId, 'request_form', {
          templateId: 'feature_spec',
          title: 'Feature spec',
        })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 30)); // run ends with the form still open
    }
  });
  await send('x');
  const s = await idle();
  expect(s.pending.form?.orphaned).toBe(true);
  const values = {
    name: 'N',
    story: 's',
    priority: 'must',
    criteria: [{ criterion: 'c' }],
  };
  await call('form.submit', {
    formId: s.pending.form?.formId,
    values,
    unsure: [],
  });
  await waitFor(() => prompts.interviewer.length === 2);
  await idle();
  expect(prompts.interviewer[1]).toContain('Form submitted');
});

test('permission requests round-trip to allow/deny', async () => {
  let r: any;
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer')
      r = await s.callTool(req.runId, 'approve_permission', {
        tool_name: 'Bash',
        input: { command: 'ls' },
      });
  });
  await send('x');
  const p = await waitFor(
    () => notes.find((n) => n.m === 'permission.requested')?.p,
  );
  await call('permission.decide', {
    requestId: p.requestId,
    allow: false,
    message: 'no',
  });
  await idle();
  expect(r).toEqual({ behavior: 'deny', message: 'no' });
});

test('spec.read/save are confined to docs/', async () => {
  await setup(standard(0));
  await call('spec.save', { file: 'docs/PRD.md', content: 'hand edit' });
  expect((await call('spec.read', { file: 'docs/PRD.md' })).content).toBe(
    'hand edit',
  );
  await expect(
    call('spec.read', { file: '../../etc/passwd' }),
  ).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' });
  await expect(
    call('spec.save', { file: 'CLAUDE.md', content: 'x' }),
  ).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' });
});

test('agent tool args are validated and unknown tools refused', async () => {
  await setup(async function* (req, s, phase) {
    if (phase === 'interviewer') {
      await expect(s.callTool(req.runId, 'ask_user', {})).rejects.toMatchObject(
        { code: 'TOOL_ARGS_INVALID' },
      );
      await expect(s.callTool(req.runId, 'nope', {})).rejects.toMatchObject({
        code: 'TOOL_UNKNOWN',
      });
      await expect(
        s.callTool(req.runId, 'submit_suggestions', {}),
      ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
      await expect(
        s.callTool('missing', 'remember', { fact: 'x' }),
      ).rejects.toMatchObject({ code: 'RUN_UNKNOWN' });
      await s.callTool(req.runId, 'remember', { fact: 'Use SQLite' });
    }
  });
  await send('x');
  await idle();
  expect(await readFile(join(dir, 'p', 'MEMORY.md'), 'utf8')).toContain(
    '- Use SQLite',
  );
});

test('bridge requires the bearer token and forwards tool results and errors', async () => {
  const b = await startBridge(async (runId, name) => {
    if (name === 'boom') throw new Error('secret detail');
    return { runId, name };
  });
  const post = (auth: string | null, body: unknown) =>
    fetch(`${b.url}/tool`, {
      method: 'POST',
      headers: {
        ...(auth ? { authorization: auth } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  expect((await post(null, {})).status).toBe(401);
  expect((await post('Bearer wrong', {})).status).toBe(401);
  expect(
    await (
      await post(`Bearer ${b.token}`, {
        runId: 'r',
        name: 'ask_user',
        args: {},
      })
    ).json(),
  ).toEqual({ ok: true, result: { runId: 'r', name: 'ask_user' } });
  const err = await (
    await post(`Bearer ${b.token}`, { runId: 'r', name: 'boom', args: {} })
  ).json();
  expect(err).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  expect(JSON.stringify(err)).not.toContain('secret detail');
  b.close();
});

test('mcp tool list exposes the active tools with object schemas; permission flag reaches the CLI args', () => {
  const tools = toolList();
  expect(tools.map((t) => t.name)).toEqual([
    'ask_user',
    'request_form',
    'submit_critique',
    'remember',
    'approve_permission',
    'submit_themes',
    'submit_stack_options',
    'submit_phase_plan',
  ]);
  for (const t of tools) expect(t.inputSchema.type).toBe('object');
  expect(
    buildArgs({
      runId: 'r',
      cwd: '/',
      prompt: 'p',
      permissionPromptTool: 'mcp__awp__approve_permission',
      mcpConfigPath: '/m.json',
    }),
  ).toEqual(
    expect.arrayContaining([
      '--permission-prompt-tool',
      'mcp__awp__approve_permission',
      '--mcp-config',
      '/m.json',
    ]),
  );
});

test('engineCommand: compiled binary vs dev script', () => {
  expect(engineCommand('/app/awp-engine', '/$bunfs/root/awp-engine')).toEqual({
    command: '/app/awp-engine',
    args: ['mcp'],
  });
  expect(
    engineCommand('/usr/bin/bun', '/repo/packages/engine/src/main.ts'),
  ).toEqual({
    command: '/usr/bin/bun',
    args: ['run', '/repo/packages/engine/src/main.ts', 'mcp'],
  });
});

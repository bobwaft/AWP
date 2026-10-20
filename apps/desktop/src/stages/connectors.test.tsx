// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const call = vi.fn();
let push: (e: { method: string; params: unknown }) => void = () => {};
const invoke = vi.fn(async () => undefined);
vi.mock('../lib/engine', () => ({
  engine: {
    call,
    on: (h: typeof push) => {
      push = h;
      return () => {};
    },
  },
  EngineError: class extends Error {
    constructor(
      m: string,
      readonly code: string,
      readonly hint?: string,
    ) {
      super(m);
    }
  },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: async () => 'C:/skills/mine',
}));
const { ConnectorsView } = await import('./ConnectorsView');
const { ToastProvider } = await import('../components/Toast');

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'mcp',
  name: id.toUpperCase(),
  summary: `${id} summary`,
  source: { repo: `https://github.com/acme/${id}`, sha: 'a'.repeat(40) },
  license: 'MIT',
  verified: true,
  agents: ['claude'],
  stages: [],
  tags: [],
  groupMode: 'complementary',
  default: false,
  install: { type: 'mcp', entry: { type: 'http', url: 'https://x.test/mcp' } },
  variants: [],
  guards: [],
  neverStages: [],
  requires: { accounts: [], env: [] },
  flags: { telemetry: false, writes: false, notes: [] },
  ...over,
});
const view = (
  id: string,
  over: Record<string, unknown> = {},
  itemOver: Record<string, unknown> = {},
) => ({
  id,
  source: 'registry',
  verified: true,
  idea: false,
  alternatives: [],
  status: 'suggested',
  reason: `Because ${id}.`,
  at: '2026-10-19T00:00:00.000Z',
  item: item(id, itemOver),
  license: { status: 'ok', note: 'MIT' },
  missingSecrets: [],
  action: 'mcp',
  notPinned: false,
  ...over,
});
const state = (
  items: unknown[],
  discovery: Record<string, unknown> = { status: 'done', source: 'tool' },
) => ({ discovery, items });

let current: ReturnType<typeof state>;
const respond = (extra: Record<string, (p: any) => unknown> = {}) =>
  call.mockImplementation(async (m: string, p: any) => {
    if (extra[m]) return extra[m](p);
    if (m === 'registry.suggest') return current;
    return 'ok';
  });
const mount = (items: unknown[], discovery?: Record<string, unknown>) => {
  current = state(items, discovery);
  respond();
  return render(
    <ToastProvider>
      <ConnectorsView />
    </ToastProvider>,
  );
};

beforeEach(() => {
  invoke.mockClear();
});
afterEach(() => {
  cleanup();
  call.mockReset();
});

test('lists suggestions with why, license, verified state and warnings', async () => {
  mount([
    view(
      'context7',
      {},
      { flags: { telemetry: true, writes: false, notes: [] } },
    ),
    view(
      'acme',
      {
        source: 'recommender',
        verified: false,
        license: { status: 'review', note: 'unknown' },
      },
      { verified: false, license: 'unknown' },
    ),
  ]);
  const c7 = (await screen.findByRole('article', {
    name: 'CONTEXT7',
  })) as HTMLElement;
  expect(within(c7).getByText('Because context7.')).toBeTruthy();
  expect(within(c7).getByText('Verified')).toBeTruthy();
  expect(within(c7).getByText(/telemetry/i)).toBeTruthy();
  const acme = screen.getByRole('article', { name: 'ACME' });
  expect(within(acme).getByText('Unverified')).toBeTruthy();
  expect(within(acme).getByText(/license: unknown/i)).toBeTruthy();
});

test('shows discovery progress and the fallback note', async () => {
  const { unmount } = mount([], { status: 'running' });
  await screen.findByText(/Looking at your specs/i);
  unmount();
  mount([view('context7')], {
    status: 'done',
    source: 'registry-only',
    note: "The project recommender isn't available. Showing AWP's own matches.",
  });
  await screen.findByText(/recommender isn't available/i);
});

test('Approve and install approves, installs, and shows the item as installed', async () => {
  mount([view('context7')]);
  respond({
    'registry.decide': () =>
      (current = state([view('context7', { status: 'approved' })])),
    'registry.install': () => {
      current = state([view('context7', { status: 'installed' })]);
      return { result: { status: 'installed' }, state: current };
    },
  });
  const card = await screen.findByRole('article', { name: 'CONTEXT7' });
  fireEvent.click(
    within(card).getByRole('button', { name: 'Approve and install' }),
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({ id: 'context7' }),
    ),
  );
  expect(call).toHaveBeenCalledWith(
    'registry.decide',
    expect.objectContaining({ id: 'context7', decision: 'approve' }),
  );
  await screen.findByText('Installed');
});

test('write-capable items default to the safe variant and offer the other as an explicit choice', async () => {
  mount([
    view(
      'linear',
      {},
      {
        flags: { telemetry: false, writes: true, notes: [] },
        variants: [
          {
            id: 'write',
            label: 'Read and write',
            safe: false,
            install: {
              type: 'mcp',
              entry: { type: 'http', url: 'https://x.test/mcp' },
            },
          },
        ],
      },
    ),
  ]);
  respond({
    'registry.decide': () => current,
    'registry.install': () => ({
      result: { status: 'installed' },
      state: current,
    }),
  });
  const card = await screen.findByRole('article', { name: 'LINEAR' });
  expect(
    within(card).getByText(/can change things in your accounts/i),
  ).toBeTruthy();
  const safe = within(card).getByRole('radio', {
    name: /Default/,
  }) as HTMLInputElement;
  expect(safe.checked).toBe(true);
  fireEvent.click(within(card).getByRole('radio', { name: 'Read and write' }));
  fireEvent.click(
    within(card).getByRole('button', { name: 'Approve and install' }),
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.decide',
      expect.objectContaining({
        id: 'linear',
        decision: 'approve',
        variant: 'write',
      }),
    ),
  );
});

test('an item that needs a token asks to connect the account first', async () => {
  mount([
    view('mongodb', {
      missingSecrets: [
        {
          name: 'MDB',
          secretKey: 'awp/mongodb/default',
          help: 'Your connection string.',
        },
      ],
    }),
  ]);
  const card = await screen.findByRole('article', { name: 'MONGODB' });
  expect(
    (
      within(card).getByRole('button', {
        name: 'Approve and install',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(within(card).getByLabelText('MDB'), {
    target: { value: 'mongodb://u:p@h/db' },
  });
  fireEvent.click(
    within(card).getByRole('button', { name: 'Connect account' }),
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('secret_set', {
      service: 'mongodb',
      account: 'default',
      value: 'mongodb://u:p@h/db',
    }),
  );
  // the token field is cleared and the state is refreshed
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('registry.suggest', expect.anything()),
  );
  expect((within(card).getByLabelText('MDB') as HTMLInputElement).value).toBe(
    '',
  );
});

test('a skill is reviewed first: files are listed, scripts need a confirmation, then it installs the previewed files', async () => {
  const preview = {
    id: 'skl',
    previewId: 'p1',
    repo: 'https://github.com/acme/skl',
    sha: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    license: 'MIT',
    target: '.claude/skills/skl',
    files: [
      { path: 'SKILL.md', size: 40, mode: '100644', flags: [] },
      {
        path: 'run.sh',
        size: 10,
        mode: '100755',
        flags: ['script', 'executable', 'shebang'],
      },
    ],
    skillMd: '# Skill body',
    scripts: [{ path: 'run.sh', text: '#!/bin/sh\necho hi' }],
    needsScriptConfirm: true,
  };
  mount([
    view(
      'skl',
      { action: 'preview' },
      { kind: 'skill', install: { type: 'skill' } },
    ),
  ]);
  respond({
    'registry.preview': () => preview,
    'registry.decide': () => current,
    'registry.install': () => ({
      result: { status: 'installed' },
      state: current,
    }),
  });
  const card = await screen.findByRole('article', { name: 'SKL' });
  expect(
    within(card).queryByRole('button', { name: 'Approve and install' }),
  ).toBeNull();
  fireEvent.click(within(card).getByRole('button', { name: 'Review files' }));
  const dialog = await screen.findByRole('dialog', { name: /Review SKL/ });
  expect(within(dialog).getByText('run.sh')).toBeTruthy();
  expect(within(dialog).getByText(/echo hi/)).toBeTruthy();
  expect(within(dialog).getByText('# Skill body')).toBeTruthy();
  expect(within(dialog).getByText('.claude/skills/skl')).toBeTruthy();
  const install = within(dialog).getByRole('button', {
    name: 'Install',
  }) as HTMLButtonElement;
  expect(install.disabled).toBe(true);
  fireEvent.click(
    within(dialog).getByRole('checkbox', { name: /read these scripts/i }),
  );
  expect(install.disabled).toBe(false);
  fireEvent.click(install);
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({
        id: 'skl',
        previewId: 'p1',
        confirmScripts: true,
      }),
    ),
  );
});

test('an unverified item needs an acknowledgement before it can be installed', async () => {
  const preview = {
    id: 'cool',
    previewId: 'p2',
    tree: 'c'.repeat(40),
    license: 'unknown',
    target: '.claude/skills/cool',
    files: [{ path: 'SKILL.md', size: 10, mode: '100644', flags: [] }],
    skillMd: 'x',
    scripts: [],
    needsScriptConfirm: false,
  };
  mount([
    view(
      'cool',
      {
        source: 'user',
        verified: false,
        action: 'preview',
        status: 'approved',
        license: { status: 'review', note: 'unknown' },
      },
      { kind: 'skill', verified: false, install: { type: 'skill' } },
    ),
  ]);
  respond({
    'registry.preview': () => preview,
    'registry.install': () => ({
      result: { status: 'installed' },
      state: current,
    }),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Review files' }));
  const dialog = await screen.findByRole('dialog', { name: /Review COOL/ });
  const install = within(dialog).getByRole('button', {
    name: 'Install',
  }) as HTMLButtonElement;
  expect(install.disabled).toBe(true);
  fireEvent.click(
    within(dialog).getByRole('checkbox', { name: /not been reviewed by AWP/i }),
  );
  expect(install.disabled).toBe(false);
  fireEvent.click(install);
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({ id: 'cool', acknowledged: true }),
    ),
  );
});

test('rejecting records it, moves it to Rejected, and can be undone', async () => {
  mount([view('context7')]);
  respond({
    'registry.decide': (p) =>
      (current = state([
        view('context7', {
          status: p.decision === 'reject' ? 'rejected' : 'suggested',
        }),
      ])),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.decide',
      expect.objectContaining({ id: 'context7', decision: 'reject' }),
    ),
  );
  const rejected = await screen.findByText(/Rejected \(1\)/);
  fireEvent.click(rejected);
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.decide',
      expect.objectContaining({ id: 'context7', decision: 'undo' }),
    ),
  );
});

test('a failed install shows what went wrong and offers a retry', async () => {
  mount([
    view('gfy', {
      status: 'failed',
      error: 'uv is not installed',
      action: 'installer',
      command: 'uv tool install graphifyy',
    }),
  ]);
  const card = await screen.findByRole('article', { name: 'GFY' });
  expect(within(card).getByText(/uv is not installed/)).toBeTruthy();
  expect(within(card).getByText('uv tool install graphifyy')).toBeTruthy();
  respond({
    'registry.install': () => ({
      result: { status: 'installed' },
      state: current,
    }),
  });
  fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({ id: 'gfy' }),
    ),
  );
});

test('an error from the engine is shown on the card, not swallowed', async () => {
  mount([view('context7')]);
  respond({
    'registry.decide': () => {
      throw Object.assign(new Error('That license is blocked.'), {
        code: 'LICENSE_BLOCKED',
      });
    },
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Approve and install' }),
  );
  await screen.findByText(/That license is blocked/);
});

test('installer items show the exact command before approval; recorded items say you run them', async () => {
  mount([
    view('gfy', {
      action: 'installer',
      command: 'uv tool install graphifyy && graphify install --project',
    }),
    view(
      'lenis',
      { action: 'doc', command: 'npm i lenis' },
      { kind: 'library', install: { type: 'doc', command: 'npm i lenis' } },
    ),
  ]);
  const gfy = await screen.findByRole('article', { name: 'GFY' });
  expect(
    within(gfy).getByText(
      'uv tool install graphifyy && graphify install --project',
    ),
  ).toBeTruthy();
  expect(within(gfy).getByText(/AWP will run this/i)).toBeTruthy();
  const lenis = screen.getByRole('article', { name: 'LENIS' });
  expect(within(lenis).getByText(/You run this yourself/i)).toBeTruthy();
  expect(within(lenis).getByRole('button', { name: 'Approve' })).toBeTruthy();
});

test('plugins are labelled as not pinned', async () => {
  mount([
    view('ponytail', { action: 'plugin', notPinned: true }, { kind: 'plugin' }),
  ]);
  const card = await screen.findByRole('article', { name: 'PONYTAIL' });
  expect(within(card).getByText(/not pinned/i)).toBeTruthy();
});

test('Complete stage asks the engine, and a gate problem is shown', async () => {
  mount([view('context7')]);
  respond({
    'stage.complete': () => {
      throw Object.assign(new Error('1 approved item is not installed yet'), {
        code: 'GATE_BLOCKED',
      });
    },
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Complete stage' }),
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('stage.complete', {
      stage: 'connectors',
    }),
  );
  await screen.findByText(/1 approved item is not installed yet/);
});

test('Add your own takes a repo URL and path, or a local folder', async () => {
  mount([]);
  respond({ 'registry.addCustom': () => current });
  fireEvent.click(await screen.findByRole('button', { name: 'Add your own…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add your own' });
  fireEvent.change(within(dialog).getByLabelText('Repository URL'), {
    target: { value: 'https://github.com/acme/skills' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Folder in the repository/), {
    target: { value: 'skills/cool' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith('registry.addCustom', {
      repoUrl: 'https://github.com/acme/skills',
      path: 'skills/cool',
    }),
  );
});

test('state pushed by the engine updates the list live', async () => {
  mount([], { status: 'running' });
  await screen.findByText(/Looking at your specs/i);
  push({ method: 'registry.state', params: state([view('context7')]) });
  await screen.findByRole('article', { name: 'CONTEXT7' });
});

const skillPreview = (id: string, previewId: string, over = {}) => ({
  id,
  previewId,
  tree: 'c'.repeat(40),
  license: 'MIT',
  target: `.claude/skills/${id}`,
  files: [{ path: 'SKILL.md', size: 10, mode: '100644', flags: [] }],
  skillMd: 'x',
  scripts: [{ path: 'run.sh', text: 'echo hi' }],
  needsScriptConfirm: true,
  ...over,
});
const skillView = (id: string, over: Record<string, unknown> = {}) =>
  view(
    id,
    { action: 'preview', verified: false, ...over },
    { kind: 'skill', verified: false, install: { type: 'skill' } },
  );

test('a doc item is approved and recorded in one click', async () => {
  mount([
    view(
      'lenis',
      { action: 'doc', command: 'npm i lenis' },
      { kind: 'library', install: { type: 'doc', command: 'npm i lenis' } },
    ),
  ]);
  respond({
    'registry.decide': () => current,
    'registry.install': () => ({
      result: { status: 'recorded', note: 'Saved to docs/TOOLING.md.' },
      state: current,
    }),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({ id: 'lenis' }),
    ),
  );
  const order = call.mock.calls.map((c) => c[0]);
  expect(order.indexOf('registry.decide')).toBeLessThan(
    order.indexOf('registry.install'),
  );
  await screen.findByText(/Saved to docs\/TOOLING\.md/);
});

test('an unverified non-file item needs a ticked acknowledgement and installs with it', async () => {
  mount([view('acme', { source: 'recommender', verified: false })]);
  respond({
    'registry.decide': () => current,
    'registry.install': () => ({
      result: { status: 'installed' },
      state: current,
    }),
  });
  const card = await screen.findByRole('article', { name: 'ACME' });
  const btn = within(card).getByRole('button', {
    name: 'Approve and install',
  }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  fireEvent.click(
    within(card).getByRole('checkbox', {
      name: 'I understand AWP has not reviewed this item.',
    }),
  );
  expect(btn.disabled).toBe(false);
  fireEvent.click(btn);
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({ id: 'acme', acknowledged: true }),
    ),
  );
});

test('the stored variant is shown, and a changed choice is re-approved before install', async () => {
  mount([
    view(
      'linear',
      { status: 'approved', variant: 'write' },
      {
        variants: [
          {
            id: 'write',
            label: 'Read and write',
            safe: false,
            install: {
              type: 'mcp',
              entry: { type: 'http', url: 'https://x.test/mcp' },
            },
          },
        ],
      },
    ),
  ]);
  respond({
    'registry.decide': () => current,
    'registry.install': () => ({
      result: { status: 'installed' },
      state: current,
    }),
  });
  const card = await screen.findByRole('article', { name: 'LINEAR' });
  expect(
    (within(card).getByRole('radio', { name: 'Read and write' }) as any)
      .checked,
  ).toBe(true);
  fireEvent.click(within(card).getByRole('radio', { name: /Default/ }));
  fireEvent.click(within(card).getByRole('button', { name: 'Install' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      'registry.install',
      expect.objectContaining({ id: 'linear' }),
    ),
  );
  const decide = call.mock.calls.find((c) => c[0] === 'registry.decide');
  expect(decide?.[1]).toEqual({ id: 'linear', decision: 'approve' });
  const order = call.mock.calls.map((c) => c[0]);
  expect(order.indexOf('registry.decide')).toBeLessThan(
    order.indexOf('registry.install'),
  );
});

test('consent checkboxes do not carry over to the next review', async () => {
  mount([skillView('a'), skillView('b')]);
  respond({
    'registry.preview': (p) => skillPreview(p.id, `p-${p.id}`),
  });
  const open = async (name: string) => {
    const card = await screen.findByRole('article', { name });
    fireEvent.click(within(card).getByRole('button', { name: 'Review files' }));
    return screen.findByRole('dialog', { name: `Review ${name}` });
  };
  const a = await open('A');
  const boxes = within(a).getAllByRole('checkbox');
  expect(boxes.length).toBe(2);
  for (const b of boxes) fireEvent.click(b);
  expect(
    (within(a).getByRole('button', { name: 'Install' }) as any).disabled,
  ).toBe(false);
  fireEvent.click(within(a).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const b = await open('B');
  for (const x of within(b).getAllByRole('checkbox'))
    expect((x as HTMLInputElement).checked).toBe(false);
  expect(
    (within(b).getByRole('button', { name: 'Install' }) as any).disabled,
  ).toBe(true);
});

test('Review files is guarded while the files load', async () => {
  mount([skillView('a')]);
  let release: (v: unknown) => void = () => {};
  respond({
    'registry.preview': () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const btn = await screen.findByRole('button', { name: 'Review files' });
  fireEvent.click(btn);
  const loading = (await screen.findByRole('button', {
    name: 'Loading files…',
  })) as HTMLButtonElement;
  expect(loading.disabled).toBe(true);
  fireEvent.click(loading);
  expect(
    call.mock.calls.filter((c) => c[0] === 'registry.preview').length,
  ).toBe(1);
  release(skillPreview('a', 'p-a'));
  await screen.findByRole('dialog', { name: /Review A/ });
});

test('Add your own clears its error and fields when closed', async () => {
  mount([]);
  respond({
    'registry.addCustom': () => {
      throw new Error('Not a repository.');
    },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Add your own…' }));
  let dialog = await screen.findByRole('dialog', { name: 'Add your own' });
  fireEvent.change(within(dialog).getByLabelText('Repository URL'), {
    target: { value: 'https://github.com/acme/x' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
  await screen.findByText(/Not a repository/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Add your own…' }));
  dialog = await screen.findByRole('dialog', { name: 'Add your own' });
  expect(within(dialog).queryByText(/Not a repository/)).toBeNull();
  expect(
    (within(dialog).getByLabelText('Repository URL') as HTMLInputElement).value,
  ).toBe('');
});

test('Run discovery again is disabled right after the click', async () => {
  mount([]);
  let release: (v: unknown) => void = () => {};
  const btn = (await screen.findByRole('button', {
    name: 'Run discovery again',
  })) as HTMLButtonElement;
  respond({
    'registry.suggest': () =>
      new Promise((r) => {
        release = r;
      }),
  });
  fireEvent.click(btn);
  await waitFor(() => expect(btn.disabled).toBe(true));
  release(current);
  await waitFor(() => expect(btn.disabled).toBe(false));
});

test('a lost preview is reloaded with a note to check the files again', async () => {
  mount([skillView('a')]);
  let n = 0;
  respond({
    'registry.preview': (p) => skillPreview(p.id, `p-${++n}`),
    'registry.decide': () => current,
    'registry.install': () => {
      throw Object.assign(new Error('Preview expired.'), {
        code: 'PREVIEW_UNKNOWN',
      });
    },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Review files' }));
  const dialog = await screen.findByRole('dialog', { name: /Review A/ });
  for (const b of within(dialog).getAllByRole('checkbox')) fireEvent.click(b);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
  await screen.findByText(
    'The files were reloaded. Check them and confirm again.',
  );
  expect(
    call.mock.calls.filter((c) => c[0] === 'registry.preview').length,
  ).toBe(2);
  const d2 = await screen.findByRole('dialog', { name: /Review A/ });
  for (const x of within(d2).getAllByRole('checkbox'))
    expect((x as HTMLInputElement).checked).toBe(false);
});

test('a stale engine is explained, with what to do about it', async () => {
  call.mockReset();
  call.mockImplementation(async () => {
    throw Object.assign(
      new Error(
        'The engine does not know "registry.suggest" (it may be out of date).',
      ),
      {
        code: 'METHOD_NOT_FOUND',
        hint: 'Fully restart AWP (close the window and run `bun run dev` again).',
      },
    );
  });
  render(
    <ToastProvider>
      <ConnectorsView />
    </ToastProvider>,
  );
  await screen.findByText(/may be out of date/);
  await screen.findByText(/Fully restart AWP/);
});

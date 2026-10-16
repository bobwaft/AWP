import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SetupDetectResult, ToolStatus } from '@awp/protocol';
import { isSupportedVersion } from './adapters/claude';

const execFileP = promisify(execFile);

/** Runs a command, resolving to stdout or null when it fails or is missing. */
export type Runner = (
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<string | null>;

export const defaultRunner: Runner = async (cmd, args, env) => {
  try {
    const { stdout, stderr } = await execFileP(cmd, args, {
      env: { ...process.env, ...env },
      windowsHide: true,
      timeout: 15000,
    });
    return stdout || stderr;
  } catch (e) {
    // A non-zero exit still prints (e.g. `gh auth status`); only ENOENT means "missing".
    const err = e as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    if (err.code === 'ENOENT') return null;
    return `${err.stdout ?? ''}${err.stderr ?? ''}` || '';
  }
};

/** Pulls "X.Y.Z" out of a `--version` line. */
export const versionOf = (out: string) => out.match(/\d+\.\d+(?:\.\d+)?/)?.[0];

/** Expands %VAR% references in a registry REG_EXPAND_SZ value. */
export const expandWinVars = (s: string, env: NodeJS.ProcessEnv) =>
  s.replace(
    /%([^%]+)%/g,
    (m, k: string) => env[k] ?? env[k.toUpperCase()] ?? m,
  );

/** Extracts the Path value from `reg query ... /v Path` output. */
export function parseRegPath(out: string): string | undefined {
  return out.match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im)?.[1]?.trim();
}

/** Windows: merge machine + user PATH from the registry so fresh installs are found. */
export async function freshEnv(
  run: Runner = defaultRunner,
  platform = process.platform,
): Promise<Record<string, string>> {
  if (platform !== 'win32') return {};
  const [user, machine] = await Promise.all([
    run('reg', ['query', 'HKCU\\Environment', '/v', 'Path']),
    run('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
      '/v',
      'Path',
    ]),
  ]);
  const parts = [machine, user]
    .map((o) => (o ? parseRegPath(o) : undefined))
    .filter((p): p is string => !!p)
    .map((p) => expandWinVars(p, process.env));
  return parts.length
    ? { PATH: [...parts, process.env.PATH ?? ''].join(';') }
    : {};
}

export async function detectTools(
  run: Runner = defaultRunner,
  platform = process.platform,
): Promise<SetupDetectResult> {
  const env = await freshEnv(run, platform);
  const r: Runner = (c, a) => run(c, a, env);

  const simple = async (bin: string): Promise<ToolStatus> => {
    const out = await r(bin, ['--version']);
    if (out === null) return { state: 'missing' };
    return { state: 'ready', version: versionOf(out) };
  };

  const claude = async (): Promise<ToolStatus> => {
    const out = await r('claude', ['--version']);
    if (out === null) return { state: 'missing' };
    const version = versionOf(out);
    let auth: {
      loggedIn?: boolean;
      email?: string;
      subscriptionType?: string;
    } = {};
    try {
      auth = JSON.parse((await r('claude', ['auth', 'status'])) ?? '{}');
    } catch {}
    if (!auth.loggedIn) return { state: 'needs_signin', version };
    return {
      state: version && isSupportedVersion(version) ? 'ready' : 'outdated',
      version,
      account: auth.email,
      plan: auth.subscriptionType,
    };
  };

  const gh = async (): Promise<ToolStatus> => {
    const base = await simple('gh');
    if (base.state === 'missing') return base;
    const out = (await r('gh', ['auth', 'status'])) ?? '';
    const account = out.match(/Logged in to \S+ account (\S+)/)?.[1];
    return account ? { ...base, account } : { ...base, state: 'needs_signin' };
  };

  const [c, g, h, s] = await Promise.all([
    claude(),
    simple('git'),
    gh(),
    simple('semgrep'),
  ]);
  return { claude: c, git: g, gh: h, semgrep: s };
}

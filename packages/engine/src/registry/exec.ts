import { execFile } from 'node:child_process';
import { EngineError } from '../errors';
import { resolveProgram } from '../resolve-program';

export type ExecResult = { code: number; stdout: string; stderr: string };
export type Exec = (
  argv: string[],
  opts: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    /** Extra environment for this command only (e.g. registry and config hardening). */
    extraEnv?: Record<string, string>;
    timeoutMs?: number;
  },
) => Promise<ExecResult>;

/**
 * Letters, digits and the punctuation that real package names and flags use. Nothing that a shell
 * could treat specially, so a registry or recommender string can never become a second command.
 */
const SAFE_TOKEN = /^[\w@./:=+,-]+$/;

/** Throws unless every part of the command is a plain token. Call before any runner. */
export function assertSafeArgv(argv: string[]): void {
  for (const t of argv)
    if (!SAFE_TOKEN.test(t))
      throw new EngineError(
        'UNSAFE_COMMAND',
        `Refusing to run an unsafe command part: ${JSON.stringify(t)}`,
      );
}

// Characters cmd.exe would act on even inside quotes (%VAR% expansion, ^ escapes, ! delayed expansion).
const CMD_UNSAFE_PATH = /["%^&|<>!\r\n]/;

export type Prepared = {
  file: string;
  args: string[];
  env: Record<string, string>;
  /** Pass `args` to CreateProcess untouched (the cmd.exe command line is built by hand). */
  verbatim: boolean;
};

/**
 * Turns an argv into something safe to start: tokens are validated, the program is resolved to an
 * absolute path outside the project (see resolve-program.ts), and Windows .cmd/.bat shims go through
 * `cmd.exe` by that absolute path with the current-directory search switched off.
 */
export function prepareSpawn(
  argv: string[],
  o: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    resolve?: typeof resolveProgram;
    extraEnv?: Record<string, string>;
  },
): Prepared {
  assertSafeArgv(argv);
  const platform = o.platform ?? process.platform;
  const program = (o.resolve ?? resolveProgram)(argv[0], {
    cwd: o.cwd,
    env: o.env,
    platform,
  });
  if (!program)
    throw Object.assign(new Error(`spawn ${argv[0]} ENOENT`), {
      code: 'ENOENT',
    });
  const args = argv.slice(1);
  const env: Record<string, string> = { ...o.extraEnv };

  if (platform === 'win32' && /\.(cmd|bat)$/i.test(program)) {
    if (CMD_UNSAFE_PATH.test(program))
      throw new EngineError(
        'UNSAFE_COMMAND',
        'Refusing to run a program whose path contains special characters.',
      );
    env.NoDefaultCurrentDirectoryInExePath = '1';
    return {
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', `"${[`"${program}"`, ...args].join(' ')}"`],
      env,
      verbatim: true,
    };
  }
  if (platform === 'win32') env.NoDefaultCurrentDirectoryInExePath = '1';
  return { file: program, args, env, verbatim: false };
}

/** Runs one argv with execFile (never a shell string). Rejects with `code: 'ENOENT'` if missing. */
export const defaultExec: Exec = (argv, opts) =>
  new Promise((resolve, reject) => {
    let p: Prepared;
    try {
      p = prepareSpawn(argv, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        extraEnv: opts.extraEnv,
      });
    } catch (e) {
      return reject(e);
    }
    const child = execFile(
      p.file,
      p.args,
      {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env, ...p.env },
        windowsHide: true,
        windowsVerbatimArguments: p.verbatim,
        timeout: opts.timeoutMs ?? 5 * 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT')
          return reject(err);
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    // nothing is typed to these commands: a prompt must fail, not wait for the timeout
    child.stdin?.end();
  });

/** Last part of a command's output, for an error message. */
export const tail = (r: ExecResult, n = 600) =>
  `${r.stdout}\n${r.stderr}`.trim().slice(-n);

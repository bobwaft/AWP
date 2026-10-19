import { execFile } from 'node:child_process';
import { EngineError } from '../errors';

export type ExecResult = { code: number; stdout: string; stderr: string };
export type Exec = (
  argv: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
) => Promise<ExecResult>;

/**
 * Letters, digits and the punctuation that real package names and flags use. Nothing that a shell
 * could treat specially, so a registry or recommender string can never become a second command.
 */
const SAFE_TOKEN = /^[\w@./:=+,-]+$/;

/** Windows ships these as .cmd shims, which cannot be spawned without a shell. */
const CMD_SHIMS = new Set(['npx', 'npm', 'pnpm', 'yarn']);

/** Throws unless every part of the command is a plain token. Call before any runner. */
export function assertSafeArgv(argv: string[]): void {
  for (const t of argv)
    if (!SAFE_TOKEN.test(t))
      throw new EngineError(
        'UNSAFE_COMMAND',
        `Refusing to run an unsafe command part: ${JSON.stringify(t)}`,
      );
}

export function toSpawn(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
): { file: string; args: string[] } {
  assertSafeArgv(argv);
  const [file, ...args] = argv;
  if (platform === 'win32' && CMD_SHIMS.has(file))
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', argv.join(' ')] };
  return { file, args };
}

/** Runs one argv with execFile (never a shell string). Rejects with `code: 'ENOENT'` if missing. */
export const defaultExec: Exec = (argv, opts) =>
  new Promise((resolve, reject) => {
    const { file, args } = toSpawn(argv);
    execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        windowsHide: true,
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
  });

/** Last part of a command's output, for an error message. */
export const tail = (r: ExecResult, n = 600) =>
  `${r.stdout}\n${r.stderr}`.trim().slice(-n);

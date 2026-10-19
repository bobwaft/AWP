import { EngineError } from '../../errors';
import {
  assertSafeArgv,
  defaultExec,
  type Exec,
  type ExecResult,
  tail,
} from '../exec';

/** The only programs an installer may start; registry data cannot widen this list. */
const ALLOWED = new Set(['npx', 'uv', 'uvx', 'graphify']);

const INSTALL_HINT: Record<string, string> = {
  uv: 'Install uv from https://docs.astral.sh/uv/ and try again.',
  uvx: 'Install uv from https://docs.astral.sh/uv/ and try again.',
  npx: 'Install Node.js from https://nodejs.org and try again.',
  graphify: 'Run the uv install step first (uv tool install graphifyy).',
};

export type InstallerRun = {
  root: string;
  /** argv lists from an owner-verified registry item; never recommender text. */
  commands: string[][];
  exec?: Exec;
};

/** Runs a registry item's installer commands in order, in the project folder. */
export async function runInstaller(
  i: InstallerRun,
): Promise<{ output: string }> {
  for (const argv of i.commands) {
    assertSafeArgv(argv);
    if (!ALLOWED.has(argv[0]))
      throw new EngineError(
        'INSTALLER_NOT_ALLOWED',
        `"${argv[0]}" is not an allowed installer program.`,
      );
  }
  const exec = i.exec ?? defaultExec;
  let output = '';
  for (const argv of i.commands) {
    let r: ExecResult;
    try {
      r = await exec(argv, { cwd: i.root });
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT')
        throw new EngineError(
          'TOOL_MISSING',
          `${argv[0]} is not installed or not on PATH.`,
          INSTALL_HINT[argv[0]],
        );
      throw e;
    }
    output += `$ ${argv.join(' ')}\n${tail(r, 600)}\n`;
    if (r.code !== 0)
      throw new EngineError(
        'INSTALLER_FAILED',
        `\`${argv.join(' ')}\` failed (exit ${r.code}).`,
        tail(r, 600),
      );
  }
  return { output: output.trim() };
}

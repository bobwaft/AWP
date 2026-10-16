import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EngineError } from './errors';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args, { cwd, windowsHide: true });
    return stdout.trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === 'ENOENT')
      throw new EngineError(
        'GIT_NOT_FOUND',
        'git is not installed',
        'Fix it in Setup.',
      );
    throw new EngineError(
      'GIT_FAILED',
      `git ${args[0]} failed: ${err.stderr?.trim() || err.message}`,
    );
  }
}

// Commits need an identity; fall back to a neutral one only when the user has none configured.
async function identityArgs(cwd: string): Promise<string[]> {
  const has = async (k: string) =>
    !!(await git(cwd, ['config', k]).catch(() => ''));
  return (await has('user.name')) && (await has('user.email'))
    ? []
    : ['-c', 'user.name=AWP', '-c', 'user.email=awp@localhost'];
}

export const BUILD_BRANCH = 'awp/build';

export const gitService = {
  init: (cwd: string) => git(cwd, ['init', '-b', 'main']),
  branch: (cwd: string) => git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
  checkoutNew: (cwd: string, name: string) =>
    git(cwd, ['checkout', '-b', name]),
  async commitAll(cwd: string, message: string): Promise<string> {
    await git(cwd, ['add', '-A']);
    await git(cwd, [
      ...(await identityArgs(cwd)),
      'commit',
      '-m',
      message,
      '--allow-empty',
    ]);
    return git(cwd, ['rev-parse', '--short', 'HEAD']);
  },
  async tag(cwd: string, name: string) {
    await git(cwd, [...(await identityArgs(cwd)), 'tag', name]);
  },
  async isClean(cwd: string) {
    return (await git(cwd, ['status', '--porcelain'])) === '';
  },
  /** Uncommitted changes vs HEAD (tracked files; add -A first for new files). */
  async diffStats(cwd: string) {
    const out = await git(cwd, ['diff', '--shortstat', 'HEAD']);
    const n = (re: RegExp) => Number(out.match(re)?.[1] ?? 0);
    return {
      files: n(/(\d+) files? changed/),
      insertions: n(/(\d+) insertions?/),
      deletions: n(/(\d+) deletions?/),
    };
  },
};

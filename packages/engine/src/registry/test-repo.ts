import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** `index: true` writes the entry straight into git's index (needed for names that only differ by case on Windows). */
export type RepoFile =
  | string
  | { content: string; mode?: string; index?: boolean };

const git = (cwd: string, args: string[], input?: string) =>
  execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();

/** A throwaway local git repo for tests. Returns its path and a `commit` helper. */
export function makeRepo(files: Record<string, RepoFile>) {
  const dir = mkdtempSync(join(tmpdir(), 'awp-src-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  const commit = (next: Record<string, RepoFile>, message = 'c') => {
    for (const [path, f] of Object.entries(next)) {
      const content = typeof f === 'string' ? f : f.content;
      const mode = typeof f === 'string' ? '100644' : (f.mode ?? '100644');
      const viaIndex = typeof f !== 'string' && f.index === true;
      if (mode === '120000' || mode === '160000' || viaIndex) {
        // symlinks and submodules go straight into the index
        const oid =
          mode === '160000'
            ? content
            : git(dir, ['hash-object', '-w', '--stdin'], content);
        git(dir, [
          'update-index',
          '--add',
          '--cacheinfo',
          `${mode},${oid},${path}`,
        ]);
        continue;
      }
      const abs = join(dir, path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      git(dir, ['add', '--', path]);
      if (mode === '100755')
        git(dir, ['update-index', '--chmod=+x', '--', path]);
    }
    git(dir, ['commit', '-q', '--allow-empty', '-m', message]);
    return git(dir, ['rev-parse', 'HEAD']);
  };
  const sha = commit(files);
  return {
    dir,
    sha,
    url: `file://${dir.replace(/\\/g, '/')}`,
    commit,
    tree: (path: string) => git(dir, ['rev-parse', `HEAD:${path}`]),
  };
}

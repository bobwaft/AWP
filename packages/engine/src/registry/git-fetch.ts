import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineError } from '../errors';

// Fetches one folder of a pinned commit with git plumbing only: nothing is ever checked out, so
// autocrlf, .gitattributes filters and symlinks cannot change the bytes we hash and preview.

export type SourceFile = {
  path: string;
  /** git mode, e.g. 100644, 100755, 120000 (symlink), 160000 (submodule). */
  mode: string;
  type: string;
  oid: string;
  size: number;
};

export type Source = {
  /** git tree SHA of the requested path at the pinned commit. */
  tree: string;
  files: SourceFile[];
  read: (path: string) => Promise<Buffer>;
};

export type FetchOpts = {
  /** Bare-repo cache root (app data). */
  cacheDir: string;
  repo: string;
  /** Full 40-character commit SHA from the registry. */
  sha: string;
  /** Folder inside the repo; '' for the repo root. */
  path: string;
  /** `source.tree` from the registry; the fetch fails if the real tree differs. */
  expectedTree?: string;
  /** Tests only: allow file:// and other URLs. */
  allowAnyUrl?: boolean;
};

const GITHUB = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;

const git = (cwd: string, args: string[]) =>
  new Promise<Buffer>((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'buffer',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      },
      (err, stdout, stderr) =>
        err
          ? reject(Object.assign(err, { stderr: stderr.toString() }))
          : resolve(stdout),
    );
  });

const ok = async (cwd: string, args: string[]) => {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
};

export async function fetchSource(opts: FetchOpts): Promise<Source> {
  if (!opts.allowAnyUrl && !GITHUB.test(opts.repo))
    throw new EngineError(
      'SOURCE_NOT_ALLOWED',
      'Only https://github.com repositories can be installed from.',
    );
  if (!/^[0-9a-f]{40}$/.test(opts.sha))
    throw new EngineError(
      'SOURCE_NOT_ALLOWED',
      'A full commit SHA is required.',
    );

  const key = createHash('sha256').update(opts.repo).digest('hex').slice(0, 16);
  const dir = join(opts.cacheDir, key);
  if (!existsSync(join(dir, 'HEAD'))) {
    await mkdir(dir, { recursive: true });
    await git(dir, ['init', '--bare', '-q']);
  }

  // A cached commit needs no network; otherwise fetch exactly that SHA (never a branch or HEAD).
  const have = () => ok(dir, ['cat-file', '-e', `${opts.sha}^{commit}`]);
  if (!(await have())) {
    try {
      await git(dir, [
        'fetch',
        '-q',
        '--depth',
        '1',
        '--no-tags',
        opts.repo,
        opts.sha,
      ]);
    } catch {
      // fall through to the check below
    }
    if (!(await have()))
      throw new EngineError(
        'SOURCE_GONE',
        'That version is no longer available from the source repository.',
        'The repository may have rewritten its history. Ask for the registry to be updated.',
      );
  }

  const path = opts.path.replace(/^\/+|\/+$/g, '');
  let tree: string;
  try {
    const spec = path ? `${opts.sha}:${path}` : `${opts.sha}^{tree}`;
    tree = (await git(dir, ['rev-parse', '--verify', spec])).toString().trim();
  } catch {
    throw new EngineError(
      'PATH_NOT_FOUND',
      `The folder "${path}" does not exist at the pinned version.`,
    );
  }
  if (opts.expectedTree && tree !== opts.expectedTree)
    throw new EngineError(
      'TREE_MISMATCH',
      'The files at the pinned version do not match the registry.',
      'The registry entry or the source may have changed. Do not install until it is re-verified.',
    );

  const listing = (
    await git(dir, ['ls-tree', '-r', '-l', '-z', tree])
  ).toString('utf8');
  const files: SourceFile[] = [];
  for (const rec of listing.split('\0')) {
    if (!rec) continue;
    const m = /^(\d+) (\w+) ([0-9a-f]{40}) +(\d+|-)\t([\s\S]*)$/.exec(rec);
    if (!m) throw new EngineError('SOURCE_INVALID', 'Unreadable file listing.');
    files.push({
      mode: m[1],
      type: m[2],
      oid: m[3],
      size: m[4] === '-' ? 0 : Number(m[4]),
      path: m[5],
    });
  }
  const byPath = new Map(files.map((f) => [f.path, f]));
  return {
    tree,
    files,
    read: async (p) => {
      const f = byPath.get(p);
      if (!f) throw new EngineError('PATH_NOT_FOUND', `No such file: ${p}`);
      return git(dir, ['cat-file', 'blob', f.oid]);
    },
  };
}

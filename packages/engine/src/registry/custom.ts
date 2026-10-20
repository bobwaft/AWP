import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, posix, relative } from 'node:path';
import { RegistryItem } from '@awp/protocol';
import { EngineError } from '../errors';
import { assertAllowedRepo, fetchSource, type Source } from './git-fetch';
import { detectLicense } from './license';
import { slug } from './match';

export type Custom = { item: RegistryItem; src: Source };

const LICENSE_FILE = /^(licen[sc]e|copying)(\.[\w-]+)?$/i;
const UNREVIEWED =
  'Added by you. Not reviewed by AWP: read its files and license first.';

/** `git ls-remote <url> HEAD`: the commit the default branch points at right now. */
function resolveHead(repo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['ls-remote', repo, 'HEAD'],
      {
        timeout: 20_000,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (err, stdout) => {
        const sha = /^([0-9a-f]{40})\s/m.exec(String(stdout))?.[1];
        if (err || !sha)
          return reject(
            new EngineError(
              'SOURCE_GONE',
              'Could not read that repository.',
              'Check the URL and that it is public.',
            ),
          );
        resolve(sha);
      },
    );
  });
}

/** A skill folder in a GitHub repo, pinned to a commit so the user previews exactly what installs. */
export async function customFromRepo(o: {
  repoUrl: string;
  sha?: string;
  path?: string;
  cacheDir: string;
  allowAnyUrl?: boolean;
}): Promise<Custom> {
  assertAllowedRepo(o.repoUrl, o.allowAnyUrl);
  const path = (o.path ?? '').replace(/^\/+|\/+$/g, '');
  const sha = o.sha ?? (await resolveHead(o.repoUrl));
  const src = await fetchSource({
    cacheDir: o.cacheDir,
    repo: o.repoUrl,
    sha,
    path,
    allowAnyUrl: o.allowAnyUrl,
  });
  if (!src.files.some((f) => f.path === 'SKILL.md'))
    throw new EngineError(
      'NOT_A_SKILL',
      'That folder has no SKILL.md at its root.',
      path
        ? undefined
        : 'Give the path of the skill folder inside the repository.',
    );

  // the license is read from the repository root at that same commit
  let license = 'unknown';
  try {
    const root = await fetchSource({
      cacheDir: o.cacheDir,
      repo: o.repoUrl,
      sha,
      path: '',
      allowAnyUrl: o.allowAnyUrl,
    });
    const f = root.files.find(
      (x) => !x.path.includes('/') && LICENSE_FILE.test(x.path),
    );
    if (f)
      license = detectLicense(
        (await root.read(f.path)).subarray(0, 8192).toString('utf8'),
      );
  } catch {
    // keep "unknown"
  }

  const name = path
    ? posix.basename(path)
    : basename(o.repoUrl.replace(/\.git$/i, ''));
  const item = RegistryItem.parse({
    id: slug(name),
    kind: 'skill',
    name,
    summary: 'Skill added from a repository by you.',
    source: { repo: o.repoUrl, sha, ...(path ? { path } : {}), tree: src.tree },
    license,
    verified: false,
    install: { type: 'skill' },
    flags: {
      notes: [
        UNREVIEWED,
        ...(o.sha
          ? [
              "This is a commit you chose. It may not be on the repository's main branch (GitHub also serves commits from forks), so check the owner and the files.",
            ]
          : []),
      ],
    },
  });
  return { item, src };
}

/** A skill folder on this computer. Read once at preview time, so what is shown is what installs. */
export async function localSource(dir: string): Promise<Source> {
  if (!isAbsolute(dir))
    throw new EngineError('INVALID_PATH', 'Give the full path of the folder.');
  let st: Stats;
  try {
    st = await stat(dir);
  } catch {
    throw new EngineError('PATH_NOT_FOUND', 'That folder does not exist.');
  }
  if (!st.isDirectory())
    throw new EngineError('NOT_A_FOLDER', 'That is a file, not a folder.');

  const files: Source['files'] = [];
  const walk = async (rel: string) => {
    for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.name === '.git' && e.isDirectory()) continue;
      if (e.isSymbolicLink())
        files.push({ path: p, mode: '120000', type: 'blob', oid: '', size: 0 });
      else if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        const s = await lstat(join(dir, p));
        const exec = process.platform !== 'win32' && (s.mode & 0o111) !== 0;
        files.push({
          path: p,
          mode: exec ? '100755' : '100644',
          type: 'blob',
          oid: '',
          size: s.size,
        });
      }
      if (files.length > 5000)
        throw new EngineError(
          'TOO_MANY_FILES',
          'That folder has too many files.',
        );
    }
  };
  await walk('');
  const tree = createHash('sha256')
    .update(JSON.stringify(files.map((f) => [f.path, f.size])))
    .digest('hex');
  const base = await realpath(dir);
  return {
    tree,
    files,
    // read through the resolved path and the open handle, so a file swapped for a link after the
    // listing cannot pull in something from outside the folder
    read: async (p) => {
      const real = await realpath(join(dir, p));
      const rel = relative(base, real);
      if (rel.startsWith('..') || isAbsolute(rel))
        throw new EngineError('UNSAFE_PATH', `${p} points outside the folder.`);
      const h = await open(real, 'r');
      try {
        if (!(await h.stat()).isFile())
          throw new EngineError('UNSAFE_PATH', `${p} is not a regular file.`);
        return await h.readFile();
      } finally {
        await h.close();
      }
    },
  };
}

export async function customFromLocal(dir: string): Promise<Custom> {
  const src = await localSource(dir);
  if (!src.files.some((f) => f.path === 'SKILL.md'))
    throw new EngineError(
      'NOT_A_SKILL',
      'That folder has no SKILL.md at its root.',
    );
  const name = basename(dir);
  const item = RegistryItem.parse({
    id: slug(name),
    kind: 'skill',
    name,
    summary: 'Skill added from a folder on this computer.',
    source: {},
    license: 'unknown',
    verified: false,
    install: { type: 'local', dir },
    flags: { notes: [UNREVIEWED] },
  });
  return { item, src };
}

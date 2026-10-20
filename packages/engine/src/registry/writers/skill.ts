import { randomBytes } from 'node:crypto';
import type { Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { EngineError } from '../../errors';
import { manifestId, type Preview, sha256 } from '../preview';

const ID = /^[a-z0-9][a-z0-9-]*$/;
export const MARKER = '.awp-install.json';

export type SkillInstall = {
  /** Project root. */
  root: string;
  /** Registry id; becomes the folder name under .claude/skills/. */
  itemId: string;
  preview: Preview;
  /** The user ticked "I read these scripts". */
  confirmScripts?: boolean;
};

type Recorded = { path: string; sha256: string };

const win = process.platform === 'win32';
const fold = (p: string) => (win ? p.toLowerCase() : p);

const inside = (parent: string, child: string) => {
  const rel = relative(fold(resolve(parent)), fold(resolve(child)));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

async function exists(p: string) {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** The nearest ancestor of `p` (or `p` itself) that exists. */
async function nearestExisting(p: string): Promise<string> {
  let cur = resolve(p);
  while (!(await exists(cur))) {
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return cur;
}

/** Hashes every file under `dir` (posix paths), ignoring AWP's own marker. Links count as changes. */
async function hashDir(dir: string): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  const walk = async (rel: string): Promise<boolean> => {
    for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (!rel && e.name === MARKER) continue;
      if (e.isSymbolicLink()) return false;
      if (e.isDirectory()) {
        if (!(await walk(p))) return false;
      } else if (e.isFile()) out.set(p, sha256(await readFile(join(dir, p))));
      else return false;
    }
    return true;
  };
  return (await walk('')) ? out : null;
}

/** 'absent', 'ours' (an AWP install nobody has edited), 'modified' (AWP's, but edited), or 'foreign'. */
async function inspect(target: string, itemId: string) {
  let st: Stats;
  try {
    st = await lstat(target);
  } catch {
    return 'absent' as const;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return 'foreign' as const;
  let marker: { itemId?: unknown; files?: unknown };
  try {
    marker = JSON.parse(await readFile(join(target, MARKER), 'utf8'));
  } catch {
    return 'foreign' as const;
  }
  const rec = marker.files;
  if (
    marker.itemId !== itemId ||
    !Array.isArray(rec) ||
    !rec.every(
      (r): r is Recorded =>
        typeof r?.path === 'string' && typeof r?.sha256 === 'string',
    )
  )
    return 'foreign' as const;
  const now = await hashDir(target);
  if (!now || now.size !== rec.length) return 'modified' as const;
  return rec.every((r) => now.get(r.path) === r.sha256)
    ? ('ours' as const)
    : ('modified' as const);
}

/**
 * Writes exactly the previewed bytes into `.claude/skills/<id>/`. The preview's blobs are
 * re-hashed against its manifest first, files go to a temp folder, are verified twice, and the
 * folder is renamed into place. The skills folder must resolve inside the project (no junctions
 * out of it), and a folder AWP did not install, or one the user has edited since, is never touched.
 */
export async function installSkill(i: SkillInstall): Promise<{ dir: string }> {
  if (!ID.test(i.itemId))
    throw new EngineError('INVALID_ID', `Not a valid item id: "${i.itemId}"`);

  const { manifest, blobs, previewId } = i.preview;
  if (manifestId(manifest) !== previewId)
    throw new EngineError(
      'PREVIEW_TAMPERED',
      'The preview does not match its id.',
    );
  for (const m of manifest) {
    const b = blobs.get(m.path);
    if (!b || b.length !== m.size || sha256(b) !== m.sha256)
      throw new EngineError(
        'PREVIEW_TAMPERED',
        'The previewed files changed after you reviewed them.',
      );
  }
  if (i.preview.needsScriptConfirm && !i.confirmScripts)
    throw new EngineError(
      'SCRIPTS_NOT_CONFIRMED',
      'This skill contains scripts or permissions that need your confirmation.',
      'Read the flagged files in the preview, then confirm.',
    );

  const skills = join(i.root, '.claude', 'skills');
  const target = join(skills, i.itemId);

  // Resolve links before anything is created: a junction at .claude or .claude/skills must not
  // make this write (or the rename and delete below) land outside the project.
  const rootReal = await realpath(i.root);
  const anchor = await realpath(await nearestExisting(skills));
  if (!inside(rootReal, anchor))
    throw new EngineError(
      'INSTALL_PATH_ESCAPES',
      '.claude/skills points outside this project, so nothing was installed.',
      'Remove the link or make it a normal folder, then try again.',
    );
  await mkdir(skills, { recursive: true });
  if (!inside(rootReal, await realpath(skills)))
    throw new EngineError(
      'INSTALL_PATH_ESCAPES',
      '.claude/skills points outside this project, so nothing was installed.',
    );

  const state = await inspect(target, i.itemId);
  if (state === 'foreign')
    throw new EngineError(
      'TARGET_EXISTS',
      `.claude/skills/${i.itemId} already exists and was not installed by AWP.`,
      'Rename or remove it, then try again.',
    );
  if (state === 'modified')
    throw new EngineError(
      'TARGET_MODIFIED',
      `You changed files in .claude/skills/${i.itemId} after AWP installed it.`,
      'Move or copy your changes somewhere else, then install again.',
    );
  const replace = state === 'ours';

  const tag = randomBytes(4).toString('hex');
  const tmp = join(skills, `.awp-tmp-${i.itemId}-${tag}`);
  const old = join(skills, `.awp-old-${i.itemId}-${tag}`);
  const verify = async () => {
    for (const m of manifest)
      if (sha256(await readFile(join(tmp, m.path))) !== m.sha256)
        throw new EngineError(
          'INSTALL_FAILED',
          `Could not write ${m.path} correctly.`,
        );
  };
  try {
    for (const m of manifest) {
      const dest = resolve(tmp, m.path);
      if (!dest.startsWith(resolve(tmp) + sep))
        throw new EngineError('UNSAFE_PATH', `Unsafe file path: ${m.path}`);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, blobs.get(m.path) as Buffer, {
        mode: m.mode === '100755' ? 0o755 : 0o644,
      });
    }
    // a second pass after every write: a later write through a name alias cannot go unnoticed
    await verify();
    const files: Recorded[] = manifest.map((m) => ({
      path: m.path,
      sha256: m.sha256,
    }));
    await writeFile(
      join(tmp, MARKER),
      JSON.stringify(
        {
          itemId: i.itemId,
          previewId,
          tree: i.preview.tree,
          at: new Date().toISOString(),
          files,
        },
        null,
        2,
      ),
    );
    if (replace) await rename(target, old);
    try {
      await rename(tmp, target);
    } catch (e) {
      if (replace) await rename(old, target).catch(() => {});
      throw e;
    }
    if (replace) await rm(old, { recursive: true, force: true });
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
  return { dir: target };
}

// kept for callers that only need to know a path exists
export const pathExists = async (p: string) =>
  !!(await stat(p).catch(() => null));

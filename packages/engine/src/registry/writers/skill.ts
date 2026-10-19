import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
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

/**
 * Writes exactly the previewed bytes into `.claude/skills/<id>/`. The preview's blobs are
 * re-hashed against its manifest first, files go to a temp folder, are re-read and verified, and
 * the folder is renamed into place. A folder AWP did not install is never touched.
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
  let replace = false;
  try {
    const marker = JSON.parse(await readFile(join(target, MARKER), 'utf8'));
    if (marker?.itemId !== i.itemId) throw new Error('foreign');
    replace = true;
  } catch {
    if (await exists(target))
      throw new EngineError(
        'TARGET_EXISTS',
        `.claude/skills/${i.itemId} already exists and was not installed by AWP.`,
        'Rename or remove it, then try again.',
      );
  }

  const tag = randomBytes(4).toString('hex');
  const tmp = join(skills, `.awp-tmp-${i.itemId}-${tag}`);
  const old = join(skills, `.awp-old-${i.itemId}-${tag}`);
  try {
    for (const m of manifest) {
      const dest = resolve(tmp, m.path);
      if (!dest.startsWith(resolve(tmp) + sep))
        throw new EngineError('UNSAFE_PATH', `Unsafe file path: ${m.path}`);
      await mkdir(dirname(dest), { recursive: true });
      const body = blobs.get(m.path) as Buffer;
      await writeFile(dest, body, {
        mode: m.mode === '100755' ? 0o755 : 0o644,
      });
      if (sha256(await readFile(dest)) !== m.sha256)
        throw new EngineError(
          'INSTALL_FAILED',
          `Could not write ${m.path} correctly.`,
        );
    }
    await writeFile(
      join(tmp, MARKER),
      JSON.stringify(
        {
          itemId: i.itemId,
          previewId,
          tree: i.preview.tree,
          at: new Date().toISOString(),
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

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

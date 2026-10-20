import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { EngineError } from '../errors';
import type { Source } from './git-fetch';

export type Caps = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};
export const DEFAULT_CAPS: Caps = {
  maxFiles: 200,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
};

export type ManifestEntry = {
  path: string;
  mode: string;
  size: number;
  sha256: string;
};

export type PreviewFile = {
  path: string;
  size: number;
  mode: string;
  flags: string[];
};

export type Preview = {
  /** Hash of the manifest: the install must present exactly this id. */
  previewId: string;
  tree: string;
  files: PreviewFile[];
  manifest: ManifestEntry[];
  /** SKILL.md text, always shown. */
  skillMd: string;
  /** Flagged non-SKILL.md files, shown inline (text is '' for binaries). */
  scripts: { path: string; text: string }[];
  /** True when any file can run code or widen permissions: Approve needs a second confirm. */
  needsScriptConfirm: boolean;
  /** The exact bytes that were previewed; the installer writes only these. */
  blobs: Map<string, Buffer>;
};

const RESERVED =
  /^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i;
const SCRIPT_EXT = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.py',
  '.rb',
  '.pl',
  '.php',
  '.vbs',
  '.exe',
  '.dll',
  '.com',
  '.psm1',
  '.psd1',
  '.wsf',
  '.hta',
  '.jar',
  '.msi',
  '.scr',
  '.lnk',
  '.reg',
  '.vbe',
  '.jse',
  '.mts',
  '.cts',
  '.tsx',
  '.jsx',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
]);
const SCRIPT_TEXT_LIMIT = 64 * 1024;

const bad = (code: string, message: string) => new EngineError(code, message);

/** Throws for any path that could escape the skill folder or misbehave on Windows. */
export function checkPath(p: string): void {
  if (
    !p ||
    p.startsWith('/') ||
    p.startsWith('\\') ||
    p.includes('\\') ||
    p.includes(':')
  )
    throw bad('UNSAFE_PATH', `Unsafe file path: ${p}`);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters on purpose
  if (/[\u0000-\u001f]/.test(p))
    throw bad('UNSAFE_PATH', `Unsafe file path: ${p}`);
  for (const seg of p.split('/')) {
    if (
      seg === '' ||
      seg === '.' ||
      seg === '..' ||
      seg.toLowerCase() === '.git' ||
      RESERVED.test(seg.split('.')[0].trim()) ||
      /[. ]$/.test(seg) ||
      /~\d/.test(seg) // 8.3 short-name alias, e.g. LONGNA~1.MD
    )
      throw bad('UNSAFE_PATH', `Unsafe file path: ${p}`);
  }
  if (posix.normalize(p) !== p)
    throw bad('UNSAFE_PATH', `Unsafe file path: ${p}`);
}

/** Locale-independent order, so the preview id is the same on every machine. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const sha256 = (b: Buffer | string) =>
  createHash('sha256').update(b).digest('hex');
export const manifestId = (m: ManifestEntry[]) =>
  sha256(JSON.stringify([...m].sort((a, b) => cmp(a.path, b.path))));
export { sha256 };

function flagsFor(path: string, mode: string, body: Buffer): string[] {
  const flags: string[] = [];
  if (mode === '100755') flags.push('executable');
  const ext = posix.extname(path).toLowerCase();
  if (SCRIPT_EXT.has(ext)) flags.push('script');
  if (body.subarray(0, 2).toString('latin1') === '#!') flags.push('shebang');
  if (body.subarray(0, 8000).includes(0)) flags.push('binary');
  if (path === 'SKILL.md') {
    const text = body.toString('utf8').replace(/^\uFEFF/, '');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
    if (/^[ \t]*['"]?allowed[-_]tools['"]?[ \t]*:/im.test(fm))
      flags.push('allowed-tools');
    if (/^[ \t]*['"]?hooks['"]?[ \t]*:/im.test(fm)) flags.push('hooks');
  }
  return flags;
}

/** Checks a fetched folder against the safety rules and builds what the user reviews. */
export async function buildPreview(
  src: Source,
  caps: Partial<Caps> = {},
): Promise<Preview> {
  const c = { ...DEFAULT_CAPS, ...caps };

  if (src.files.length > c.maxFiles)
    throw bad('TOO_MANY_FILES', `More than ${c.maxFiles} files.`);
  const seen = new Map<string, string>();
  let total = 0;
  for (const f of src.files) {
    if (f.mode === '120000')
      throw bad(
        'SYMLINK_NOT_ALLOWED',
        `Symbolic links are not allowed: ${f.path}`,
      );
    if (f.mode === '160000' || f.type === 'commit')
      throw bad(
        'SUBMODULE_NOT_ALLOWED',
        `Submodules are not allowed: ${f.path}`,
      );
    checkPath(f.path);
    if (f.size > c.maxFileBytes)
      throw bad(
        'FILE_TOO_LARGE',
        `${f.path} is larger than ${c.maxFileBytes} bytes.`,
      );
    total += f.size;
    const k = f.path.toLowerCase();
    if (seen.has(k))
      throw bad(
        'CASE_COLLISION',
        `${f.path} and ${seen.get(k)} differ only by letter case.`,
      );
    seen.set(k, f.path);
  }
  if (total > c.maxTotalBytes)
    throw bad(
      'SKILL_TOO_LARGE',
      `The folder is larger than ${c.maxTotalBytes} bytes.`,
    );
  if (!src.files.some((f) => f.path === 'SKILL.md'))
    throw bad('NOT_A_SKILL', 'The folder has no SKILL.md at its root.');

  const blobs = new Map<string, Buffer>();
  const manifest: ManifestEntry[] = [];
  const files: PreviewFile[] = [];
  const scripts: { path: string; text: string }[] = [];
  let confirm = false;
  let actual = 0;
  for (const f of [...src.files].sort((a, b) => cmp(a.path, b.path))) {
    const body = Buffer.from(await src.read(f.path)); // own copy
    // the listing can be stale or wrong (a swapped local file): the caps apply to what was read
    if (body.length > c.maxFileBytes)
      throw bad(
        'FILE_TOO_LARGE',
        `${f.path} is larger than ${c.maxFileBytes} bytes.`,
      );
    actual += body.length;
    if (actual > c.maxTotalBytes)
      throw bad(
        'SKILL_TOO_LARGE',
        `The folder is larger than ${c.maxTotalBytes} bytes.`,
      );
    blobs.set(f.path, body);
    manifest.push({
      path: f.path,
      mode: f.mode,
      size: body.length,
      sha256: sha256(body),
    });
    const flags = flagsFor(f.path, f.mode, body);
    files.push({ path: f.path, size: body.length, mode: f.mode, flags });
    if (flags.length) confirm = true;
    if (flags.length && f.path !== 'SKILL.md')
      scripts.push({
        path: f.path,
        text: flags.includes('binary')
          ? ''
          : body.subarray(0, SCRIPT_TEXT_LIMIT).toString('utf8'),
      });
  }
  return {
    previewId: manifestId(manifest),
    tree: src.tree,
    files,
    manifest,
    skillMd: blobs.get('SKILL.md')?.toString('utf8') ?? '',
    scripts,
    needsScriptConfirm: confirm,
    blobs,
  };
}

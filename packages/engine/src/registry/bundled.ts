import { createHash } from 'node:crypto';
import { BUNDLED_SKILLS } from '../../../../registry/skills/index';
import type { Source } from './git-fetch';

/**
 * A skill folder that ships inside AWP, shaped like a fetched one so it goes through the same
 * preview, caps and atomic install. `tree` is a hash of its files (there is no git tree).
 */
export function bundledSource(id: string): Source | null {
  const folder = BUNDLED_SKILLS[id];
  if (!folder) return null;
  const paths = Object.keys(folder).sort();
  const tree = createHash('sha256')
    .update(JSON.stringify(paths.map((p) => [p, folder[p]])))
    .digest('hex');
  return {
    tree,
    files: paths.map((path) => ({
      path,
      mode: '100644',
      type: 'blob',
      oid: '',
      size: Buffer.byteLength(folder[path]),
    })),
    read: async (path) => Buffer.from(folder[path] ?? '', 'utf8'),
  };
}

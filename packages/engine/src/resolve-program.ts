import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Finds a program on PATH, never in the project folder.
 *
 * On Windows the OS and libuv look in the working directory before PATH, so a repository that ships
 * `npx.cmd` or `claude.exe` would run its own file in place of the real tool. This resolves the
 * absolute path ourselves, skipping relative PATH entries and anything inside `cwd`.
 */
export function resolveProgram(
  name: string,
  opts: {
    /** The folder the program will run in (the project). */
    cwd: string;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
  },
): string | null {
  if (!name || /[\\/]/.test(name)) return null;
  const env = opts.env ?? process.env;
  const win = (opts.platform ?? process.platform) === 'win32';
  const path = (win ? (env.Path ?? env.PATH) : env.PATH) ?? '';
  const sep = win ? ';' : delimiter;
  const exts = win
    ? /\.[a-z0-9]+$/i.test(name)
      ? ['']
      : (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const norm = (p: string) => (win ? resolve(p).toLowerCase() : resolve(p));
  const cwd = norm(opts.cwd);

  for (const entry of path.split(sep)) {
    if (!entry || !isAbsolute(entry)) continue; // '', '.', and other relative entries
    const e = norm(entry);
    const rel = relative(cwd, e);
    if (e === cwd || (rel && !rel.startsWith('..') && !isAbsolute(rel)))
      continue; // inside the project
    for (const ext of exts) {
      const candidate = join(entry, name + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

/**
 * The program to start for a run whose arguments are arbitrary text (a prompt): an absolute path
 * outside the project, or an ENOENT failure. Never the bare name, because the OS would then look
 * in the project folder first. A .cmd/.bat shim cannot take arbitrary arguments safely, so it is
 * refused (libuv only ever started .exe/.com for a bare name as well).
 */
export function launchProgram(
  name: string,
  opts: { cwd: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform },
): string {
  const found = resolveProgram(name, opts);
  if (!found || /\.(cmd|bat)$/i.test(found))
    throw Object.assign(new Error(`spawn ${name} ENOENT`), { code: 'ENOENT' });
  return found;
}

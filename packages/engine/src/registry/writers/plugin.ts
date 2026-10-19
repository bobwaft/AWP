import { EngineError } from '../../errors';
import {
  assertSafeArgv,
  defaultExec,
  type Exec,
  type ExecResult,
  tail,
} from '../exec';

export type PluginInstall = {
  root: string;
  /** `owner/repo` (or URL) for `claude plugin marketplace add`. */
  marketplace: string;
  /** `<plugin>@<marketplace-name>` */
  plugin: string;
  exec?: Exec;
};

/**
 * Installs a plugin with the user's own `claude` CLI at project scope (Claude Code writes
 * `.claude/settings.json` itself). No terminal is involved, and argv is fixed. The marketplace is
 * not pinned to a commit: Claude Code installs its latest, and the card says so.
 */
export async function installPlugin(
  p: PluginInstall,
): Promise<{ output: string }> {
  const exec = p.exec ?? defaultExec;
  const steps = [
    [
      'claude',
      'plugin',
      'marketplace',
      'add',
      p.marketplace,
      '--scope',
      'project',
    ],
    ['claude', 'plugin', 'install', p.plugin, '--scope', 'project', '-y'],
  ];
  for (const argv of steps) assertSafeArgv(argv);
  let output = '';
  for (const [i, argv] of steps.entries()) {
    let r: ExecResult;
    try {
      r = await exec(argv, { cwd: p.root });
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT')
        throw new EngineError(
          'TOOL_MISSING',
          'Claude Code is not installed or not on PATH.',
          'Finish Setup first.',
        );
      throw e;
    }
    output += `${tail(r, 400)}\n`;
    if (r.code === 0) continue;
    // Adding a marketplace that is already there is fine.
    if (i === 0 && /already/i.test(`${r.stdout}${r.stderr}`)) continue;
    throw new EngineError(
      'PLUGIN_INSTALL_FAILED',
      `Claude Code could not install ${p.plugin}.`,
      tail(r, 400),
    );
  }
  return { output: output.trim() };
}

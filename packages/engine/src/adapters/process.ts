import { type ChildProcess, spawn, spawnSync } from 'node:child_process';

const win = process.platform === 'win32';

/** Spawns in its own process group (POSIX) so the whole tree can be signalled. */
export function spawnTree(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv },
) {
  return spawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !win,
    windowsHide: true,
  });
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (win) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      return;
    }
    // Escalate if it ignores SIGTERM.
    setTimeout(() => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, 2000).unref();
  }
}

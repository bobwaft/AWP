import { expect, test } from 'vitest';
import { killTree, spawnTree } from './process';

test.skipIf(process.platform === 'win32')(
  'killTree ends a process and its children',
  async () => {
    const c = spawnTree('sh', ['-c', 'sleep 30 & wait'], { cwd: '.' });
    await new Promise((r) => setTimeout(r, 200));
    const closed = new Promise((r) => c.on('close', r));
    killTree(c);
    await Promise.race([
      closed,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('still alive')), 5000),
      ),
    ]);
    expect(c.signalCode ?? c.exitCode).toBeTruthy();
  },
);

import type { Os } from '@awp/protocol';

export const currentOs = (): Os => {
  const p = navigator.userAgent;
  return /Windows/i.test(p) ? 'win32' : /Mac/i.test(p) ? 'darwin' : 'linux';
};

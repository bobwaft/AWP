import type { Os } from '@awp/protocol';

/** The same plain-token rule the engine applies before it will run or hand out a command. */
const SAFE_TOKEN = /^[\w@./:=+,-]+$/;

const EXIT_MARKER = /\[awp-exit:(-?\d+)\]/;
// colour and cursor sequences the terminal may wrap around text
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes on purpose
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const part = (c: string[]) => {
  for (const t of c)
    if (!SAFE_TOKEN.test(t))
      throw new Error(`Unsafe command part: ${JSON.stringify(t)}`);
  return c.join(' ');
};

/**
 * One line to type into the shell: the commands in order (a later one runs only if the earlier
 * succeeded), then a marker that prints the exit code. The marker is built so the typed text itself
 * has no digits after `awp-exit:`, which means echoing the line back can never look like a result.
 */
export function buildTerminalLine(commands: string[][], os: Os): string {
  if (!commands.length) throw new Error('Nothing to run');
  if (os === 'win32') {
    // Windows PowerShell 5.1 has no `&&`, so nest `if ($awpS)`. After every step the success flag and
    // exit code are saved: a program that is not installed has no exit code, and still has to count as
    // a failure (`$?` is false, `$LASTEXITCODE` empty).
    const save = '$awpS = $?; $awpC = $LASTEXITCODE';
    const chain = (i: number): string =>
      i === commands.length - 1
        ? `${part(commands[i])}; ${save}`
        : `${part(commands[i])}; ${save}; if ($awpS) { ${chain(i + 1)} }`;
    return `${chain(0)}; Write-Host ("[awp-exit:" + $(if ($awpS) { 0 } elseif ($awpC) { $awpC } else { 1 }) + "]")`;
  }
  return `${commands.map(part).join(' && ')}; echo "[awp-exit:$?]"`;
}

/** The exit code printed by the marker, or null if it has not appeared (yet). */
export function readExitCode(output: string): number | null {
  const m = EXIT_MARKER.exec(output.replace(ANSI, ''));
  return m ? Number(m[1]) : null;
}

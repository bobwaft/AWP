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
 * succeeded). After every step a `[awp-step:i:code]` marker is printed, and at the end an
 * `[awp-exit:code]` one. The markers are built so the typed text itself has no digits after the colon,
 * which means echoing the line back can never look like a result.
 */
export function buildTerminalLine(commands: string[][], os: Os): string {
  if (!commands.length) throw new Error('Nothing to run');
  if (os === 'win32') {
    // Windows PowerShell 5.1 has no `&&`, so nest `if ($awpS)`. After every step the success flag and
    // exit code are saved: a program that is not installed has no exit code, and still has to count as
    // a failure (`$?` is false, `$LASTEXITCODE` empty).
    const code = '$(if ($awpS) { 0 } elseif ($awpC) { $awpC } else { 1 })';
    const step = (i: number) =>
      `${part(commands[i])}; $awpS = $?; $awpC = $LASTEXITCODE; Write-Host ("[awp-step:${i}:" + ${code} + "]")`;
    const chain = (i: number): string =>
      i === commands.length - 1
        ? step(i)
        : `${step(i)}; if ($awpS) { ${chain(i + 1)} }`;
    return `${chain(0)}; Write-Host ("[awp-exit:" + ${code} + "]")`;
  }
  const step = (i: number) =>
    `${part(commands[i])}; awp_s=$?; echo "[awp-step:${i}:$awp_s]"`;
  const chain = (i: number): string =>
    i === commands.length - 1
      ? step(i)
      : `${step(i)}; if [ $awp_s -eq 0 ]; then ${chain(i + 1)}; fi`;
  return `${chain(0)}; echo "[awp-exit:$awp_s]"`;
}

/** The exit code printed by the marker, or null if it has not appeared (yet). */
export function readExitCode(output: string): number | null {
  const m = EXIT_MARKER.exec(output.replace(ANSI, ''));
  return m ? Number(m[1]) : null;
}

const STEP_MARKER = /\[awp-step:(\d+):(-?\d+)\]/g;
const ALREADY = /already (installed|added|exists|on disk)/i;

/**
 * What a finished run means. A tool that finds its work already done often exits non-zero
 * ("is already installed from another marketplace"); when the step that failed is the last one and its
 * own output says so, the item is there, so it counts as installed. An earlier step's output never
 * counts, and neither does a failure before the last step.
 */
export function interpretRun(
  output: string,
  steps: number,
): { code: number; alreadyInstalled: boolean } | null {
  const text = output.replace(ANSI, '');
  const code = readExitCode(text);
  if (code === null) return null;
  if (code === 0) return { code, alreadyInstalled: false };
  let from = 0;
  for (const m of text.matchAll(STEP_MARKER)) {
    if (Number(m[2]) !== 0) {
      const last = Number(m[1]) === steps - 1;
      const said = ALREADY.test(text.slice(from, m.index));
      return last && said
        ? { code: 0, alreadyInstalled: true }
        : { code, alreadyInstalled: false };
    }
    from = (m.index ?? 0) + m[0].length;
  }
  return { code, alreadyInstalled: false };
}

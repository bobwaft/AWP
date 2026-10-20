import { expect, test } from 'vitest';
import { buildTerminalLine, readExitCode } from './terminalCommand';

const one = [['npm', 'i', 'lenis']];
const two = [
  ['uv', 'tool', 'install', 'graphifyy==0.9.91'],
  ['graphify', 'install', '--project'],
];
const three = [
  ['a', '1'],
  ['b', '2'],
  ['c', '3'],
];

test('Windows (PowerShell): later commands run only if the earlier ones succeeded, and a code is always printed', () => {
  const marker =
    'Write-Host ("[awp-exit:" + $(if ($awpS) { 0 } elseif ($awpC) { $awpC } else { 1 }) + "]")';
  expect(buildTerminalLine(one, 'win32')).toBe(
    `npm i lenis; $awpS = $?; $awpC = $LASTEXITCODE; ${marker}`,
  );
  expect(buildTerminalLine(two, 'win32')).toBe(
    `uv tool install graphifyy==0.9.91; $awpS = $?; $awpC = $LASTEXITCODE; if ($awpS) { graphify install --project; $awpS = $?; $awpC = $LASTEXITCODE }; ${marker}`,
  );
  expect(buildTerminalLine(three, 'win32')).toBe(
    `a 1; $awpS = $?; $awpC = $LASTEXITCODE; if ($awpS) { b 2; $awpS = $?; $awpC = $LASTEXITCODE; if ($awpS) { c 3; $awpS = $?; $awpC = $LASTEXITCODE } }; ${marker}`,
  );
});

test('macOS and Linux: commands are chained with && and the exit status is printed', () => {
  expect(buildTerminalLine(one, 'darwin')).toBe(
    'npm i lenis; echo "[awp-exit:$?]"',
  );
  expect(buildTerminalLine(two, 'linux')).toBe(
    'uv tool install graphifyy==0.9.91 && graphify install --project; echo "[awp-exit:$?]"',
  );
});

test('the typed line itself never contains a readable exit code, so echoing it back cannot fake a result', () => {
  for (const os of ['win32', 'darwin', 'linux'] as const)
    expect(readExitCode(buildTerminalLine(two, os))).toBeNull();
});

test('reads the exit code from terminal output, across chunks and through colour codes', () => {
  expect(readExitCode('installing...\r\n[awp-exit:0]\r\n')).toBe(0);
  expect(readExitCode('boom\r\n[awp-exit:127]')).toBe(127);
  expect(readExitCode('[awp-exit:-1]')).toBe(-1);
  expect(readExitCode('\u001b[32m[awp-exit:\u001b[0m0]')).toBe(0); // colour codes inside the marker are removed first
  expect(readExitCode('[awp-ex')).toBeNull(); // an unfinished marker (callers accumulate chunks until it completes)
  expect(readExitCode('\u001b[1m[awp-exit:5]\u001b[0m')).toBe(5);
  expect(readExitCode('no marker here')).toBeNull();
  expect(readExitCode('[awp-exit:abc]')).toBeNull();
});

test('only plain tokens are ever joined into a line', () => {
  expect(() => buildTerminalLine([['npm', 'i', 'a b']], 'win32')).toThrow();
  expect(() => buildTerminalLine([['npm', 'i', 'x;y']], 'linux')).toThrow();
  expect(() => buildTerminalLine([['npm', 'i', '$(x)']], 'darwin')).toThrow();
  expect(() => buildTerminalLine([], 'win32')).toThrow();
});

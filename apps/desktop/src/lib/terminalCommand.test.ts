import { expect, test } from 'vitest';
import {
  buildTerminalLine,
  interpretRun,
  readExitCode,
} from './terminalCommand';

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

test('Windows (PowerShell): each step saves its status and prints a step marker; the next step runs only after a success', () => {
  const l = buildTerminalLine(two, 'win32');
  expect(
    l.startsWith(
      'uv tool install graphifyy==0.9.91; $awpS = $?; $awpC = $LASTEXITCODE; Write-Host ("[awp-step:0:"',
    ),
  ).toBe(true);
  expect(l).toContain(
    'if ($awpS) { graphify install --project; $awpS = $?; $awpC = $LASTEXITCODE; Write-Host ("[awp-step:1:"',
  );
  // a missing program has no exit code, and still has to be a failure
  expect(
    l.endsWith(
      '+ $(if ($awpS) { 0 } elseif ($awpC) { $awpC } else { 1 }) + "]")',
    ),
  ).toBe(true);
  expect(l.lastIndexOf('[awp-exit:')).toBeGreaterThan(
    l.lastIndexOf('[awp-step:'),
  );
  expect(
    buildTerminalLine(three, 'win32').match(/; if \(\$awpS\) \{/g)?.length,
  ).toBe(2);
});

test('macOS and Linux: each step prints a marker, and the next runs only after a success', () => {
  expect(buildTerminalLine(one, 'darwin')).toBe(
    'npm i lenis; awp_s=$?; echo "[awp-step:0:$awp_s]"; echo "[awp-exit:$awp_s]"',
  );
  expect(buildTerminalLine(two, 'linux')).toBe(
    'uv tool install graphifyy==0.9.91; awp_s=$?; echo "[awp-step:0:$awp_s]"; if [ $awp_s -eq 0 ]; then graphify install --project; awp_s=$?; echo "[awp-step:1:$awp_s]"; fi; echo "[awp-exit:$awp_s]"',
  );
});

test('the typed line itself never contains a readable marker, so echoing it back cannot fake a result', () => {
  for (const os of ['win32', 'darwin', 'linux'] as const) {
    const line = buildTerminalLine(two, os);
    expect(readExitCode(line), os).toBeNull();
    expect(interpretRun(line, 2), os).toBeNull();
  }
});

test('reads the exit code from terminal output, through colour codes and unfinished markers', () => {
  expect(readExitCode('installing...\r\n[awp-exit:0]\r\n')).toBe(0);
  expect(readExitCode('boom\r\n[awp-exit:127]')).toBe(127);
  expect(readExitCode('[awp-exit:-1]')).toBe(-1);
  expect(readExitCode('\u001b[32m[awp-exit:\u001b[0m0]')).toBe(0);
  expect(readExitCode('\u001b[1m[awp-exit:5]\u001b[0m')).toBe(5);
  expect(readExitCode('[awp-ex')).toBeNull();
  expect(readExitCode('no marker here')).toBeNull();
  expect(readExitCode('[awp-exit:abc]')).toBeNull();
});

const SKILL_CREATOR =
  'Installing plugin "skill-creator@claude-plugins-official"...✘ Failed to install plugin "skill-creator@claude-plugins-official": "skill-creator" is already installed from Anthropic Directory. To switch to claude-plugins-official: claude plugin install skill-creator@claude-plugins-official --replace --scope project';

test('a finished run is reported with its exit code', () => {
  expect(
    interpretRun(
      'x\r\n[awp-step:0:0]\r\n[awp-step:1:0]\r\n[awp-exit:0]\r\n',
      2,
    ),
  ).toEqual({ code: 0, alreadyInstalled: false });
  expect(
    interpretRun('[awp-step:0:0]\n[awp-step:1:3]\nboom\n[awp-exit:3]', 2),
  ).toEqual({ code: 3, alreadyInstalled: false });
  expect(interpretRun('still running\n[awp-step:0:0]\n', 2)).toBeNull();
});

test('"already installed" on the step that failed counts as installed (the real skill-creator output)', () => {
  const out = `Adding marketplace...already on disk\r\n[awp-step:0:0]\r\n${SKILL_CREATOR}\r\n[awp-step:1:1]\r\n[awp-exit:1]\r\n`;
  expect(interpretRun(out, 2)).toEqual({ code: 0, alreadyInstalled: true });
});

test('other "already" phrasings count too', () => {
  for (const msg of [
    '`graphifyy` is already installed',
    'Marketplace already added',
    'skill already exists',
    'already on disk',
  ])
    expect(
      interpretRun(`${msg}\n[awp-step:0:1]\n[awp-exit:1]`, 1),
      msg,
    ).toEqual({ code: 0, alreadyInstalled: true });
});

test('an earlier step saying "already installed" cannot hide a later failure', () => {
  const out =
    '`uv` tool is already installed\n[awp-step:0:0]\nerror: could not write .claude/skills\n[awp-step:1:1]\n[awp-exit:1]';
  expect(interpretRun(out, 2)).toEqual({ code: 1, alreadyInstalled: false });
});

test('a failure before the last step stays a failure (later steps never ran)', () => {
  const out =
    'Executable already exists: graphify\n[awp-step:0:2]\n[awp-exit:2]';
  expect(interpretRun(out, 2)).toEqual({ code: 2, alreadyInstalled: false });
});

test('a failure with no "already" message stays a failure, and the echoed command line is never mistaken for one', () => {
  const echoed = `${buildTerminalLine([['npm', 'i', 'already-installed-pkg']], 'linux')}\n`;
  expect(
    interpretRun(`${echoed}npm ERR! 404\n[awp-step:0:1]\n[awp-exit:1]`, 1),
  ).toEqual({ code: 1, alreadyInstalled: false });
});

test('only plain tokens are ever joined into a line', () => {
  expect(() => buildTerminalLine([['npm', 'i', 'a b']], 'win32')).toThrow();
  expect(() => buildTerminalLine([['npm', 'i', 'x;y']], 'linux')).toThrow();
  expect(() => buildTerminalLine([['npm', 'i', '$(x)']], 'darwin')).toThrow();
  expect(() => buildTerminalLine([], 'win32')).toThrow();
});

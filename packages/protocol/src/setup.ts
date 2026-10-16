import { z } from 'zod';

export const ToolId = z.enum(['claude', 'git', 'gh', 'semgrep']);
export type ToolId = z.infer<typeof ToolId>;

export const ToolStatus = z.object({
  state: z.enum(['missing', 'needs_signin', 'outdated', 'ready', 'error']),
  version: z.string().optional(),
  account: z.string().optional(),
  plan: z.string().optional(),
});
export type ToolStatus = z.infer<typeof ToolStatus>;

export const SetupDetectResult = z.object({
  claude: ToolStatus,
  git: ToolStatus,
  gh: ToolStatus,
  semgrep: ToolStatus,
});
export type SetupDetectResult = z.infer<typeof SetupDetectResult>;

/** Required tools block "Continue to Ideation"; optional ones never do. */
export const REQUIRED_TOOLS: ToolId[] = ['git', 'claude'];
export const setupReady = (r: SetupDetectResult) =>
  REQUIRED_TOOLS.every((t) => r[t].state === 'ready');

export type Os = 'win32' | 'darwin' | 'linux';
export type Fix = {
  title: string;
  /** Typed at the prompt, never executed by AWP. */
  command: string;
  explain: string;
  manual: { steps: string[]; url: string };
};

/** AWP's built-in fix list. `pty_write` accepts input from the UI only, never an agent. */
export const FIXES: Record<string, Partial<Record<Os, Fix>>> = {
  'git:missing': {
    win32: {
      title: 'Setup · Git',
      command: 'winget install --id Git.Git -e',
      explain:
        "Installs Git for Windows with Windows' package manager (winget).",
      manual: {
        steps: ['Download the installer', 'Run it with the defaults'],
        url: 'https://git-scm.com/download/win',
      },
    },
    darwin: {
      title: 'Setup · Git',
      command: 'xcode-select --install',
      explain: "Installs Apple's command line tools, which include Git.",
      manual: {
        steps: ['Run xcode-select --install in Terminal'],
        url: 'https://git-scm.com/download/mac',
      },
    },
    linux: {
      title: 'Setup · Git',
      command: 'sudo apt-get install -y git',
      explain: 'Installs Git with apt.',
      manual: {
        steps: ['Install git with your package manager'],
        url: 'https://git-scm.com/download/linux',
      },
    },
  },
  'claude:missing': {
    win32: {
      title: 'Setup · Claude Code',
      command: 'irm https://claude.ai/install.ps1 | iex',
      explain: "Installs Claude Code using Anthropic's official installer.",
      manual: {
        steps: ['Follow the Claude Code setup guide'],
        url: 'https://docs.claude.com/en/docs/claude-code/setup',
      },
    },
    darwin: {
      title: 'Setup · Claude Code',
      command: 'curl -fsSL https://claude.ai/install.sh | bash',
      explain: "Installs Claude Code using Anthropic's official installer.",
      manual: {
        steps: ['Follow the Claude Code setup guide'],
        url: 'https://docs.claude.com/en/docs/claude-code/setup',
      },
    },
    linux: {
      title: 'Setup · Claude Code',
      command: 'curl -fsSL https://claude.ai/install.sh | bash',
      explain: "Installs Claude Code using Anthropic's official installer.",
      manual: {
        steps: ['Follow the Claude Code setup guide'],
        url: 'https://docs.claude.com/en/docs/claude-code/setup',
      },
    },
  },
  'claude:needs_signin': Object.fromEntries(
    (['win32', 'darwin', 'linux'] as Os[]).map((os) => [
      os,
      {
        title: 'Setup · Claude sign-in',
        command: 'claude',
        explain:
          'Opens Claude Code. Type /login inside it and follow the browser prompt.',
        manual: {
          steps: ['Run claude in a terminal', 'Type /login'],
          url: 'https://docs.claude.com/en/docs/claude-code/setup',
        },
      },
    ]),
  ),
  'gh:missing': {
    win32: {
      title: 'Setup · GitHub CLI',
      command: 'winget install --id GitHub.cli -e',
      explain: 'Installs the GitHub CLI with winget.',
      manual: {
        steps: ['Download the installer'],
        url: 'https://cli.github.com',
      },
    },
    darwin: {
      title: 'Setup · GitHub CLI',
      command: 'brew install gh',
      explain: 'Installs the GitHub CLI with Homebrew.',
      manual: {
        steps: ['Download the installer'],
        url: 'https://cli.github.com',
      },
    },
    linux: {
      title: 'Setup · GitHub CLI',
      command: 'sudo apt-get install -y gh',
      explain: 'Installs the GitHub CLI with apt.',
      manual: {
        steps: ['See the install guide'],
        url: 'https://cli.github.com',
      },
    },
  },
  'gh:needs_signin': Object.fromEntries(
    (['win32', 'darwin', 'linux'] as Os[]).map((os) => [
      os,
      {
        title: 'Setup · GitHub sign-in',
        command: 'gh auth login',
        explain: 'Signs in to GitHub in your browser.',
        manual: {
          steps: ['Run gh auth login'],
          url: 'https://cli.github.com/manual/gh_auth_login',
        },
      },
    ]),
  ),
  'semgrep:missing': {
    win32: {
      title: 'Setup · Semgrep',
      command: 'pip install semgrep',
      explain: 'Installs Semgrep with pip.',
      manual: {
        steps: ['Install Python, then pip install semgrep'],
        url: 'https://semgrep.dev/docs/getting-started/',
      },
    },
    darwin: {
      title: 'Setup · Semgrep',
      command: 'brew install semgrep',
      explain: 'Installs Semgrep with Homebrew.',
      manual: {
        steps: ['brew install semgrep'],
        url: 'https://semgrep.dev/docs/getting-started/',
      },
    },
    linux: {
      title: 'Setup · Semgrep',
      command: 'pip install semgrep',
      explain: 'Installs Semgrep with pip.',
      manual: {
        steps: ['pip install semgrep'],
        url: 'https://semgrep.dev/docs/getting-started/',
      },
    },
  },
};

export const fixFor = (tool: ToolId, state: string, os: Os): Fix | undefined =>
  FIXES[`${tool}:${state === 'outdated' ? 'missing' : state}`]?.[os];

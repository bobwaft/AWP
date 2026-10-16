import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { EngineError } from '../errors';

export type ToolCall = (
  runId: string,
  name: string,
  args: unknown,
) => Promise<unknown>;

/** Localhost HTTP bridge: the `awp-engine mcp` child (spawned by the agent) forwards tool calls here. */
export async function startBridge(call: ToolCall) {
  const token = randomBytes(24).toString('hex');
  const server = createServer((req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/tool')
      return send(404, { ok: false });
    if (req.headers.authorization !== `Bearer ${token}`)
      return send(401, { ok: false });
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const { runId, name, args } = JSON.parse(body) as {
          runId: string;
          name: string;
          args: unknown;
        };
        send(200, { ok: true, result: await call(runId, name, args) });
      } catch (e) {
        const code = e instanceof EngineError ? e.code : 'INTERNAL';
        const message = e instanceof EngineError ? e.message : 'Internal error';
        send(200, {
          ok: false,
          error: { code, message, hint: (e as EngineError).hint },
        });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => server.close(),
  };
}

export type Bridge = Awaited<ReturnType<typeof startBridge>>;

/** How an agent starts the MCP proxy: the compiled binary itself, or `bun run main.ts` in dev. */
export function engineCommand(
  execPath = process.execPath,
  main = process.argv[1] ?? '',
): { command: string; args: string[] } {
  const compiled =
    main.startsWith('/$bunfs') ||
    main.includes('~BUN') ||
    !/\.(ts|js|mjs)$/.test(main);
  return compiled
    ? { command: execPath, args: ['mcp'] }
    : { command: execPath, args: ['run', main, 'mcp'] };
}

/** Writes a per-run MCP config and returns its path plus env to inject. The Figma token is never written: the config references ${FIGMA_TOKEN} and the token travels in the run env only. */
export function mcpLauncher(
  root: string,
  bridge: Bridge,
  getFigmaToken?: () => Promise<string | null>,
) {
  return async (runId: string, opts: { figma: boolean } = { figma: false }) => {
    const dir = join(root, '.awp', 'runs', runId);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'mcp.json');
    const { command, args } = engineCommand();
    const servers: Record<string, unknown> = {
      awp: {
        command,
        args,
        env: {
          AWP_BRIDGE_URL: bridge.url,
          AWP_BRIDGE_TOKEN: bridge.token,
          AWP_RUN_ID: runId,
        },
      },
    };
    const env: Record<string, string> = {};
    const token = opts.figma ? await getFigmaToken?.() : null;
    if (token) {
      servers.figma = {
        type: 'http',
        url: 'https://mcp.figma.com/mcp',
        headers: { Authorization: 'Bearer ${FIGMA_TOKEN}' },
      };
      env.FIGMA_TOKEN = token;
    }
    await writeFile(file, JSON.stringify({ mcpServers: servers }, null, 2));
    return { path: file, env: token ? env : undefined };
  };
}

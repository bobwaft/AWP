import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import pkg from '../package.json';
import { createHandlers } from './handlers';
import { createOutbound, getSecret } from './outbound';
import { createHandler } from './server';

// Rust passes the app-data logs dir; fall back to cwd/logs when run by hand.
const logDir = process.env.AWP_LOG_DIR ?? join(process.cwd(), 'logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, 'engine.log');
const log = (msg: string) =>
  appendFileSync(
    logFile,
    `${JSON.stringify({ t: new Date().toISOString(), msg })}\n`,
  );

const outbound = createOutbound((l) => process.stdout.write(`${l}\n`));
const notify = (method: string, params: unknown) =>
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`,
  );
const handle = createHandler(
  createHandlers(notify, undefined, {
    getSecret: (key) => getSecret(outbound, key),
  }),
  log,
);

log(`engine ${pkg.version} started, pid ${process.pid}`);
// Requests run concurrently (a slow detect must not block ping/stop); replies are matched by id.
createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim() || outbound.handleLine(line)) return;
  handle(line)
    .then((out) => out && process.stdout.write(`${out}\n`))
    .catch((e) => log(`write failed: ${String(e)}`));
});

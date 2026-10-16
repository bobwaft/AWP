import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import pkg from '../package.json';
import { createHandlers } from './handlers';
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

const notify = (method: string, params: unknown) =>
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`,
  );
const handle = createHandler(createHandlers(notify), log);

log(`engine ${pkg.version} started, pid ${process.pid}`);
// Serialize replies so output order matches input order.
let chain = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  chain = chain
    .then(async () => {
      const out = await handle(line);
      if (out) process.stdout.write(`${out}\n`);
    })
    .catch((e) => log(`write failed: ${String(e)}`));
});

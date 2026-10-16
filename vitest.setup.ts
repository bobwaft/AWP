import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep the engine's app-data (projects.json) out of the repo's ./data fallback.
process.env.AWP_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'awp-test-data-'));

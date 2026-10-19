import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { McpEntry } from '@awp/protocol';
import { EngineError } from '../../errors';

const NAME = /^[A-Za-z0-9][\w.-]*$/;

export type McpWrite = {
  /** Project root; the file is `<root>/.mcp.json`. */
  root: string;
  /** Server name (the key under mcpServers). */
  name: string;
  entry: McpEntry;
  /** The existing entry of this name was written by AWP, so it may be replaced. */
  owned?: boolean;
  /** Secret values that must never appear in the file (defense in depth). */
  secrets?: string[];
};

/**
 * Merges one server into `.mcp.json`, keeping everything else. Secrets only ever appear as
 * `${VAR}` references; an entry that AWP did not write is never overwritten, and a file that is
 * not valid JSON is left alone.
 */
export async function writeMcpEntry(w: McpWrite): Promise<void> {
  if (!NAME.test(w.name))
    throw new EngineError('INVALID_ID', `Not a valid server name: "${w.name}"`);
  const parsed = McpEntry.safeParse(w.entry);
  if (!parsed.success)
    throw new EngineError(
      'MCP_ENTRY_INVALID',
      parsed.error.issues[0]?.message ?? 'Invalid MCP entry',
      'Secrets must be ${VAR} references.',
    );
  const entry = parsed.data;

  const file = join(w.root, '.mcp.json');
  let doc: { mcpServers?: Record<string, unknown> } & Record<string, unknown> =
    {};
  try {
    const raw = await readFile(file, 'utf8');
    try {
      const j = JSON.parse(raw);
      if (!j || typeof j !== 'object' || Array.isArray(j))
        throw new Error('shape');
      doc = j;
    } catch {
      throw new EngineError(
        'MCP_JSON_INVALID',
        '.mcp.json is not valid JSON, so AWP left it alone.',
        'Fix or remove the file, then try again.',
      );
    }
  } catch (e) {
    if (e instanceof EngineError) throw e;
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  doc.mcpServers ??= {};
  const servers = doc.mcpServers as Record<string, unknown>;
  const existing = servers[w.name];
  if (
    existing !== undefined &&
    !w.owned &&
    JSON.stringify(existing) !== JSON.stringify(entry)
  )
    throw new EngineError(
      'MCP_NAME_CLASH',
      `.mcp.json already has a server called "${w.name}" that AWP did not add.`,
      'Rename or remove it, then try again.',
    );
  servers[w.name] = entry;

  const text = `${JSON.stringify(doc, null, 2)}\n`;
  for (const s of w.secrets ?? [])
    if (s && text.includes(s))
      throw new EngineError(
        'SECRET_IN_CONFIG',
        'A secret value would have been written into .mcp.json.',
      );

  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, file);
}

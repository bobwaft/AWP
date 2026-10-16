export type Prompt = {
  id: string;
  version: number;
  taskType: string;
  requiredTools: string[];
  body: string;
};

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Parses a Markdown prompt with `key: value` front matter (requiredTools is comma separated). */
export function parsePrompt(src: string): Prompt {
  const m = src.match(FRONT);
  if (!m) throw new Error('Prompt is missing front matter');
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ['id', 'version', 'taskType'])
    if (!meta[k]) throw new Error(`Prompt front matter is missing "${k}"`);
  return {
    id: meta.id,
    version: Number(meta.version),
    taskType: meta.taskType,
    requiredTools: (meta.requiredTools ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    body: m[2].trim(),
  };
}

/** Replaces {{var}}; unknown variables throw so a typo never reaches the agent. */
export function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    if (!(k in vars)) throw new Error(`Missing prompt variable: ${k}`);
    return vars[k];
  });
}

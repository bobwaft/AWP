import type { AgentEvent } from '@awp/protocol';

type Block = { type: string; [k: string]: unknown };
const str = (v: unknown) => (typeof v === 'string' ? v : '');

// tool name -> file_change kind, derived from the tool_use input when the result succeeds.
const FILE_TOOLS: Record<string, 'add' | 'edit'> = {
  Write: 'add',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
};

/** Parses one stream-json line from `claude -p` into zero or more AgentEvents. Stateless per line except `calls`. */
export function createClaudeParser() {
  const calls = new Map<
    string,
    { name: string; input: Record<string, unknown> }
  >();

  return (line: string): AgentEvent[] => {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      return [];
    }
    const out: AgentEvent[] = [];
    if (o.type === 'system' && o.subtype === 'init') {
      out.push({
        type: 'session',
        sessionId: str(o.session_id),
        model: str(o.model) || undefined,
      });
    } else if (o.type === 'assistant') {
      const content = ((o.message as { content?: Block[] })?.content ??
        []) as Block[];
      for (const b of content) {
        if (b.type === 'text' && str(b.text)) {
          out.push({ type: 'message', role: 'assistant', text: str(b.text) });
        } else if (b.type === 'tool_use') {
          const input = (b.input ?? {}) as Record<string, unknown>;
          calls.set(str(b.id), { name: str(b.name), input });
          out.push({
            type: 'tool_call',
            name: str(b.name),
            input,
            id: str(b.id),
          });
          if (b.name === 'Bash')
            out.push({ type: 'command', cmd: str(input.command) });
        }
      }
    } else if (o.type === 'user') {
      const content = ((o.message as { content?: Block[] })?.content ??
        []) as Block[];
      for (const b of content) {
        if (b.type !== 'tool_result') continue;
        const id = str(b.tool_use_id);
        const ok = b.is_error !== true;
        const text = Array.isArray(b.content)
          ? (b.content as Block[]).map((c) => str(c.text)).join('')
          : str(b.content);
        out.push({ type: 'tool_result', id, ok, summary: text.slice(0, 300) });
        const call = calls.get(id);
        const kind = call && FILE_TOOLS[call.name];
        if (ok && call && kind) {
          const path = str(call.input.file_path ?? call.input.notebook_path);
          if (path) out.push({ type: 'file_change', path, kind });
        }
      }
    } else if (o.type === 'result') {
      const u = (o.usage ?? {}) as Record<string, number>;
      out.push({
        type: 'usage',
        inputTokens:
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        costUsd:
          typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
      });
      out.push({ type: 'done', status: o.is_error ? 'error' : 'success' });
    }
    return out;
  };
}

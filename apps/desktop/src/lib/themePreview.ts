import type { DesignTokens } from '@awp/protocol';

// Font stacks come from the agent; keep only characters valid in a CSS font-family list.
const safeFont = (f: string, fallback: string) =>
  /^[\w\s,'"-]+$/.test(f) ? f : fallback;

/** Self-contained HTML for an isolated (sandboxed, script-free) iframe preview of a theme. */
export function themePreviewHtml(t: DesignTokens): string {
  const c = t.colors;
  const sans = safeFont(t.fonts.sans, 'system-ui, sans-serif');
  const mono = safeFont(t.fonts.mono, 'monospace');
  const s = t.spacing;
  const dur = { none: '0ms', subtle: '150ms', expressive: '350ms' }[t.motion];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:${s * 3}px;background:${c.bg};color:${c.text};font:14px/1.4 ${sans};display:flex;flex-direction:column;gap:${s * 3}px}
.card{background:${c.surface};border:1px solid ${c.line};border-radius:${t.radius}px;padding:${s * 3}px;display:flex;flex-direction:column;gap:${s * 2}px}
h1{margin:0;font-size:16px}
p{margin:0;color:${c.textMuted}}
.row{display:flex;gap:${s * 2}px;flex-wrap:wrap}
button{font:inherit;border-radius:${t.radius}px;padding:${s * 2}px ${s * 3}px;border:1px solid ${c.line};background:${c.surface};color:${c.text};transition:all ${dur}}
button.primary{background:${c.accent};border-color:${c.accent};color:${c.onAccent}}
button:hover{filter:brightness(.95)}
input{font:inherit;width:100%;border-radius:${t.radius}px;padding:${s * 2}px;border:1px solid ${c.line};background:${c.bg};color:${c.text}}
code{font-family:${mono};font-size:12px;color:${c.textMuted}}
.tag{border-radius:999px;padding:0 ${s * 2}px;border:1px solid;font-size:12px}
</style></head><body>
<div class="card"><h1>Sample card</h1><p>Secondary text sits here.</p>
<input placeholder="Input field" aria-label="Input field">
<div class="row"><button class="primary">Primary</button><button>Secondary</button></div>
<div class="row"><span class="tag" style="color:${c.success}">Success</span><span class="tag" style="color:${c.warning}">Warning</span><span class="tag" style="color:${c.danger}">Danger</span></div>
<code>const tokens = "${t.density}";</code></div>
</body></html>`;
}

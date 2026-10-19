export type RecommenderKind =
  | 'mcp'
  | 'skill'
  | 'hook'
  | 'subagent'
  | 'plugin'
  | 'command'
  | 'other';

export type RecommenderItem = {
  name: string;
  kind: RecommenderKind;
  /** Section heading the item sat under, e.g. "MCP Servers". */
  category: string;
  why: string;
  install?: string;
  create?: string;
  where?: string;
  /** First github.com URL found in the item's text. */
  repoUrl?: string;
};

const KIND_BY_WORD: [RegExp, RecommenderKind][] = [
  [/\bmcp\b/i, 'mcp'],
  [/\bplugin/i, 'plugin'],
  [/\bskill/i, 'skill'],
  [/\bhook/i, 'hook'],
  [/\bsub-?agent/i, 'subagent'],
  [/\bslash command|\bcommands?\b/i, 'command'],
];

const kindOf = (category: string): RecommenderKind =>
  KIND_BY_WORD.find(([re]) => re.test(category))?.[1] ?? 'other';

const FIELD = /^\*\*(Why|Install|Create|Where|Invocation)\*\*\s*:?\s*(.*)$/i;

/**
 * Parses the markdown the claude-code-setup recommender prints (`### <category>` sections with
 * `#### <item>` entries and **Why** / **Install** / **Create** / **Where** lines). Tolerant: unknown
 * categories become `other`, missing fields stay empty, anything outside a category is ignored.
 */
export function parseRecommendations(md: string): RecommenderItem[] {
  const items: RecommenderItem[] = [];
  let category: string | null = null;
  let cur: RecommenderItem | null = null;
  let field: 'why' | 'install' | 'create' | 'where' | null = null;
  let fence = false;
  const done = () => {
    if (cur) {
      cur.why = cur.why.trim();
      cur.repoUrl = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.exec(
        [cur.why, cur.install, cur.create, cur.where].join('\n'),
      )?.[0];
      items.push(cur);
    }
    cur = null;
    field = null;
  };

  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line.trim())) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h3 = /^###\s+(.+?)\s*#*$/.exec(line);
    const h4 = /^####\s+(.+?)\s*#*$/.exec(line);
    if (h4 && category) {
      done();
      cur = { name: h4[1].trim(), kind: kindOf(category), category, why: '' };
      continue;
    }
    if (h3 && !h4) {
      done();
      category = h3[1].replace(/[^\p{L}\p{N} /-]/gu, '').trim();
      continue;
    }
    if (/^---+\s*$/.test(line) || /^\*\*Want (more|help)/i.test(line)) {
      done();
      continue;
    }
    if (!cur) continue;
    const f = FIELD.exec(line.trim());
    if (f) {
      const key = f[1].toLowerCase();
      const text = f[2].trim().replace(/^`(.*)`$/, '$1');
      if (key === 'invocation') {
        field = null;
        continue;
      }
      field = key as 'why' | 'install' | 'create' | 'where';
      if (field === 'why') cur.why = text;
      else cur[field] = text;
      continue;
    }
    if (field === 'why' && line.trim()) cur.why += ` ${line.trim()}`;
  }
  done();
  return items;
}

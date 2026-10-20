const MIN_SECRET = 8;
const ASSIGN =
  /\b(token|api[_-]?key|secret|password|passwd|authorization|bearer)(\s*[=:]\s*)(?:Bearer\s+)?[^\s"',;]+/gi;

// scheme://user:password@host: credentials embedded in a connection string or URL
const URL_CREDS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi;

/**
 * Removes secrets from text that may be stored in a committed file or shown in the UI: the known
 * values (raw, JSON-escaped and URL-encoded) and any `token=…` / `password: …` style assignment.
 */
export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s.length < MIN_SECRET) continue;
    const forms = new Set([
      s,
      JSON.stringify(s).slice(1, -1),
      encodeURIComponent(s),
    ]);
    for (const f of forms) out = out.split(f).join('[redacted]');
  }
  out = out.replace(URL_CREDS, '$1[redacted]@');
  return out.replace(
    ASSIGN,
    (_m, k: string, sep: string) =>
      `${k}${sep.trim() === ':' ? ': ' : '='}[redacted]`,
  );
}

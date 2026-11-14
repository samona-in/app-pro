import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, derived from this file, so the scripts work from any cwd. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Reads the repo `.env` without overriding anything already exported.
 *
 * The migration needs `DATABASE_URL` (the source of the identity list) and the
 * NEW project's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Values are only
 * read into this process; nothing here is forwarded to a log or to a report.
 */
export function loadEnv() {
  const env = { ...process.env };
  let text = '';
  try {
    text = readFileSync(path.join(repoRoot, '.env'), 'utf8');
  } catch {
    return env;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2];
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    if (env[match[1]] === undefined) env[match[1]] = value;
  }

  return env;
}

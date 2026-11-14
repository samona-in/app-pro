#!/usr/bin/env node
/**
 * Exports the SAMONA identity list for the Supabase Auth migration.
 *
 * Two sources are supported:
 *
 * - `auth` (default): the source project's `auth.users` table, read over a
 *   direct Postgres connection. This is the authoritative identity list — it
 *   has every user who ever signed up, whether or not a profile row exists in
 *   any application database, and it is reachable even while the project's
 *   HTTP API is restricted (the Fair Use restriction blocks the API, not
 *   Postgres).
 * - `profiles`: the application's `profiles` table. Useful when the app
 *   database is the only reachable source.
 *
 * Either way the output is the same shape: `{ id, phone, email, fullName,
 * createdAt }`, and `id` is preserved on recreate so `profiles.id` stays equal
 * to `auth.users.id`.
 *
 * Safety contract:
 * - Read-only. The only statement issued is a single SELECT.
 * - The output file contains PII (phone, email). It is written under the
 *   ignored `.state/` directory by default and must never be committed.
 * - Phone numbers are masked in all console output and reports.
 *
 * Usage:
 *   node scripts/supabase-auth-migration/export-users.mjs                 # auth.users
 *   node scripts/supabase-auth-migration/export-users.mjs --source profiles
 *   node scripts/supabase-auth-migration/export-users.mjs --out /tmp/users.json
 *
 * Run `--help` for every flag.
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from './env.mjs';
import { maskPhone, writeAtomicJson } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = loadEnv();

/**
 * The `auth.users` query. `raw_user_meta_data->>'full_name'` is best-effort:
 * GoTrue stores whatever the client sent, which may be absent.
 */
const AUTH_QUERY = `SELECT id, phone, email, raw_user_meta_data->>'full_name' AS full_name, created_at
   FROM auth.users
   WHERE deleted_at IS NULL AND phone IS NOT NULL
   ORDER BY created_at`;

/**
 * The `profiles` query. Quoted camelCase columns are the ones Prisma does not
 * remap; only `is_admin` and `deleted_at` carry `@map`.
 */
const PROFILES_QUERY = `SELECT id, phone, email, "fullName" AS full_name, "createdAt" AS created_at
   FROM profiles
   WHERE deleted_at IS NULL AND phone IS NOT NULL
   ORDER BY "createdAt"`;

function usage() {
  console.log(`Export the SAMONA identity list for the Supabase Auth migration.

Options:
  --source <auth|profiles>  Where to read identities from (default auth).
  --out <path>              Output file (default .state/users.json).
  --include-deleted         Also export rows with deleted_at set.
  --database-url <url>      Source database (default DATABASE_URL).
  --no-ssl                  Disable TLS on the connection.
  --help                    Show this help.

Sources:
  auth      SELECT id, phone, email, raw_user_meta_data->>'full_name', created_at
            FROM auth.users WHERE deleted_at IS NULL AND phone IS NOT NULL;
  profiles  SELECT id, phone, email, "fullName", "createdAt"
            FROM profiles WHERE deleted_at IS NULL AND phone IS NOT NULL;
`);
}

function parseArgs(argv) {
  const opts = {
    source: 'auth',
    out: path.join(HERE, '.state', 'users.json'),
    includeDeleted: false,
    databaseUrl: ENV.DATABASE_URL,
    ssl: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[i];
    };
    switch (arg) {
      case '--source':
        opts.source = value();
        if (!['auth', 'profiles'].includes(opts.source)) {
          throw new Error(`--source must be "auth" or "profiles", got "${opts.source}".`);
        }
        break;
      case '--out':
        opts.out = path.resolve(value());
        break;
      case '--include-deleted':
        opts.includeDeleted = true;
        break;
      case '--database-url':
        opts.databaseUrl = value();
        break;
      case '--no-ssl':
        opts.ssl = false;
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

/** Host only, so a connection string never reaches a log or a report. */
function safeHost(databaseUrl) {
  try {
    return new URL(databaseUrl).host;
  } catch {
    return '(unparseable)';
  }
}

function queryFor(opts) {
  const base = opts.source === 'auth' ? AUTH_QUERY : PROFILES_QUERY;
  if (!opts.includeDeleted) return base;
  // The default queries filter deleted rows; drop that clause for --include-deleted.
  return base.replace('WHERE deleted_at IS NULL AND phone IS NOT NULL', 'WHERE phone IS NOT NULL');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Pass --database-url or export it in your shell.');
  }

  const client = new pg.Client({
    connectionString: opts.databaseUrl,
    ssl: opts.ssl ? { rejectUnauthorized: false } : undefined,
  });

  console.log(
    `Reading ${opts.source === 'auth' ? 'auth.users' : 'profiles'} from ${safeHost(opts.databaseUrl)} (read-only) …`,
  );
  await client.connect();

  let rows;
  try {
    const { rows: result } = await client.query(queryFor(opts));
    rows = result;
  } finally {
    await client.end();
  }

  const users = rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));

  const withoutPhone = users.filter((user) => !user.phone).length;
  const duplicatePhones = new Set();
  const seen = new Set();
  for (const user of users) {
    if (seen.has(user.phone)) duplicatePhones.add(user.phone);
    seen.add(user.phone);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: opts.source,
    sourceHost: safeHost(opts.databaseUrl),
    includeDeleted: opts.includeDeleted,
    count: users.length,
    users,
  };

  if (!existsSync(path.dirname(opts.out))) mkdirSync(path.dirname(opts.out), { recursive: true });
  writeAtomicJson(opts.out, payload);

  console.log('');
  console.log(`Exported ${users.length} ${opts.source} identity(ies) to ${opts.out}`);
  console.log(`  include deleted:  ${opts.includeDeleted}`);
  console.log(`  missing phone:    ${withoutPhone}`);
  console.log(`  duplicate phones: ${duplicatePhones.size}`);
  if (duplicatePhones.size > 0) {
    console.warn('  WARNING: duplicate phone numbers will collide on the destination project.');
    for (const phone of duplicatePhones) console.warn(`    ${maskPhone(phone)}`);
  }
  if (users.length > 0) {
    console.log('  sample (masked):');
    for (const user of users.slice(0, 5)) {
      console.log(`    ${user.id}  ${maskPhone(user.phone)}`);
    }
  }
  console.log('');
  console.log('Next: node scripts/supabase-auth-migration/recreate-users.mjs  (dry run)');
}

main().catch((error) => {
  console.error(`\nExport failed: ${error.message}`);
  process.exitCode = 1;
});

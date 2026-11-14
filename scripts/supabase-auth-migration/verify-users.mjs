#!/usr/bin/env node
/**
 * Verifies that every exported SAMONA identity exists on the destination
 * Supabase project, by id and by phone.
 *
 * Read-only. Issues a single paged `GET /auth/v1/admin/users` and compares the
 * result against the export produced by `export-users.mjs`. Exits non-zero when
 * any source user is missing, so it can gate the cutover.
 *
 * Usage:
 *   node scripts/supabase-auth-migration/verify-users.mjs
 *   node scripts/supabase-auth-migration/verify-users.mjs --json
 *
 * Run `--help` for every flag.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
import { hostOf, listAllUsers, maskPhone, phoneKey, readJson } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = loadEnv();

function usage() {
  console.log(`Verify the destination project against the source export.

Options:
  --users <path>         Export to compare (default .state/users.json).
  --base-url <url>       Destination project URL (default SUPABASE_URL).
  --service-key <key>    Destination service-role key (default SUPABASE_SERVICE_ROLE_KEY).
  --json                 Print the full report as JSON.
  --help                 Show this help.

Exit code is 1 when any source user is missing from the destination.
`);
}

function parseArgs(argv) {
  const opts = {
    usersFile: path.join(HERE, '.state', 'users.json'),
    baseUrl: ENV.SUPABASE_URL,
    serviceKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[i];
    };
    switch (arg) {
      case '--users':
        opts.usersFile = path.resolve(value());
        break;
      case '--base-url':
        opts.baseUrl = value();
        break;
      case '--service-key':
        opts.serviceKey = value();
        break;
      case '--json':
        opts.json = true;
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(opts.usersFile)) {
    throw new Error(`Export not found at ${opts.usersFile}. Run export-users.mjs first.`);
  }
  if (!opts.baseUrl)
    throw new Error('SUPABASE_URL is not set. Pass --base-url or update your .env.');
  if (!opts.serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Pass --service-key or update your .env.',
    );
  }

  const source = readJson(opts.usersFile).users ?? [];
  const host = hostOf(opts.baseUrl);

  const destination = await listAllUsers({ baseUrl: opts.baseUrl, serviceKey: opts.serviceKey });
  const destinationById = new Map(destination.map((user) => [user.id, user]));
  const destinationByPhone = new Map(
    destination.map((user) => [phoneKey(user.phone), user]).filter(([key]) => Boolean(key)),
  );

  const missing = [];
  const relinked = [];
  const phoneMismatch = [];
  for (const user of source) {
    const match = destinationById.get(user.id);
    if (!match) {
      const byPhone = destinationByPhone.get(phoneKey(user.phone));
      if (byPhone) {
        relinked.push({
          sourceId: user.id,
          destinationId: byPhone.id,
          phone: maskPhone(user.phone),
        });
      } else {
        missing.push({ id: user.id, phone: maskPhone(user.phone) });
      }
      continue;
    }
    if (phoneKey(match.phone) !== phoneKey(user.phone)) {
      phoneMismatch.push({
        id: user.id,
        expected: maskPhone(user.phone),
        actual: maskPhone(match.phone),
      });
    }
  }

  const sourceIds = new Set(source.map((user) => user.id));
  const relinkedIds = new Set(relinked.map((row) => row.destinationId));
  const extra = destination
    .filter((user) => !sourceIds.has(user.id) && !relinkedIds.has(user.id))
    .map((user) => ({ id: user.id, phone: maskPhone(user.phone) }));

  const report = {
    generatedAt: new Date().toISOString(),
    destinationHost: host,
    sourceCount: source.length,
    destinationCount: destination.length,
    missing,
    relinked,
    phoneMismatch,
    extra,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Destination: ${host}`);
    console.log(`  source users:      ${source.length}`);
    console.log(`  destination users: ${destination.length}`);
    console.log(`  missing:           ${missing.length}`);
    console.log(`  relinked by phone: ${relinked.length}`);
    console.log(`  phone mismatches:  ${phoneMismatch.length}`);
    console.log(`  extra (not ours):  ${extra.length}`);
    if (missing.length > 0) {
      console.log('');
      console.log('Missing (run recreate-users.mjs --execute to retry):');
      for (const row of missing) console.log(`  ${row.id}  ${row.phone}`);
    }
    if (relinked.length > 0) {
      console.log('');
      console.log('Relinked by phone (id differs — the server re-keys profiles.id on sign-in):');
      for (const row of relinked) {
        console.log(`  ${row.sourceId} -> ${row.destinationId}  ${row.phone}`);
      }
    }
    if (phoneMismatch.length > 0) {
      console.log('');
      console.log('Phone mismatches:');
      for (const row of phoneMismatch) {
        console.log(`  ${row.id}  expected ${row.expected}  actual ${row.actual}`);
      }
    }
    if (extra.length > 0) {
      console.log('');
      console.log('Extra destination users (not from this export — review before deleting):');
      for (const row of extra) console.log(`  ${row.id}  ${row.phone}`);
    }
  }

  if (missing.length > 0) {
    console.log('');
    console.log(`Verification FAILED: ${missing.length} source user(s) missing.`);
    process.exitCode = 1;
  } else {
    console.log('');
    console.log('Verification OK: every source identity exists on the destination.');
  }
}

main().catch((error) => {
  console.error(`\nVerify failed: ${error.message}`);
  process.exitCode = 1;
});

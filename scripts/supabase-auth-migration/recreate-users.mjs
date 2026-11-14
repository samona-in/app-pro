#!/usr/bin/env node
/**
 * Recreates SAMONA identities on the destination Supabase project.
 *
 * Reads the export produced by `export-users.mjs` and creates one Auth user per
 * profile via the Admin API, preserving each `id` so `profiles.id` stays equal
 * to `auth.users.id` and no re-key cascade touches jobs or earnings.
 *
 * Safety contract:
 * - Dry-run by default. Nothing is created without `--execute`.
 * - Idempotent: existing users are discovered first and matched by id, then by
 *   phone. A user that already exists is never recreated.
 * - State is persisted after every user, so an interrupted run resumes.
 * - The service-role key is read from the environment and never logged.
 * - Phone numbers are masked in all output.
 *
 * Usage:
 *   node scripts/supabase-auth-migration/recreate-users.mjs                 # dry run
 *   node scripts/supabase-auth-migration/recreate-users.mjs --limit 3       # dry run, 3 users
 *   node scripts/supabase-auth-migration/recreate-users.mjs --execute       # create
 *   node scripts/supabase-auth-migration/recreate-users.mjs --execute --resume
 *
 * Run `--help` for every flag.
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
import {
  authFetch,
  createLogger,
  createStateStore,
  ensureDir,
  hostOf,
  isRetryableStatus,
  listAllUsers,
  maskPhone,
  phoneKey,
  readJson,
  runPool,
  withRetry,
  writeAtomicJson,
  writeJson,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = loadEnv();

/** The restricted project this migration exists to move off of. */
const OLD_PROJECT_REF = 'mbylupexffssmyiqgwnb';
const SUCCESS_STATUSES = new Set(['created', 'already-exists']);

function usage() {
  console.log(`Recreate SAMONA identities on the destination Supabase project.

Options:
  --execute              Create users. Without this flag the run is a dry run.
  --users <path>         Export to read (default .state/users.json).
  --base-url <url>       Destination project URL (default SUPABASE_URL).
  --service-key <key>    Destination service-role key (default SUPABASE_SERVICE_ROLE_KEY).
  --concurrency <n>      Parallel creates (default 2, max 8).
  --limit <n>            Process at most n users.
  --resume               Skip users already recorded as successful (default).
  --no-resume            Reprocess every user.
  --fresh                Archive the previous state file and start over.
  --force                Allow running against the old, restricted project.
  --state-dir <path>     State + report directory.
  --help                 Show this help.
`);
}

function parsePositiveInt(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function parseArgs(argv) {
  const opts = {
    execute: false,
    usersFile: path.join(HERE, '.state', 'users.json'),
    baseUrl: ENV.SUPABASE_URL,
    serviceKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    concurrency: 2,
    limit: Number.POSITIVE_INFINITY,
    resume: true,
    fresh: false,
    force: false,
    stateDir: path.join(HERE, '.state'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[i];
    };
    switch (arg) {
      case '--execute':
        opts.execute = true;
        break;
      case '--users':
        opts.usersFile = path.resolve(value());
        break;
      case '--base-url':
        opts.baseUrl = value();
        break;
      case '--service-key':
        opts.serviceKey = value();
        break;
      case '--concurrency':
        opts.concurrency = Math.min(8, parsePositiveInt(value(), arg));
        break;
      case '--limit':
        opts.limit = parsePositiveInt(value(), arg);
        break;
      case '--resume':
        opts.resume = true;
        break;
      case '--no-resume':
        opts.resume = false;
        break;
      case '--fresh':
        opts.fresh = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--state-dir':
        opts.stateDir = path.resolve(value());
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

function indexExisting(users) {
  const byId = new Map();
  const byPhone = new Map();
  for (const user of users) {
    if (user.id) byId.set(user.id, user);
    const key = phoneKey(user.phone);
    if (key) byPhone.set(key, user);
  }
  return { byId, byPhone };
}

/**
 * Classifies one source user against the destination project.
 *
 * Order matters: an id match means this exact identity already exists (success,
 * resumable). A phone match under a different id is a real conflict — creating
 * the preserved id would fail with `phone_exists`, so it is surfaced rather
 * than silently re-linked.
 */
function classify(user, existing) {
  if (existing.byId.has(user.id)) return { action: 'already-exists', reason: 'id' };
  const phoneMatch = existing.byPhone.get(phoneKey(user.phone));
  if (phoneMatch) {
    return {
      action: 'conflict',
      reason: 'phone-taken',
      existingId: phoneMatch.id,
    };
  }
  return { action: 'create' };
}

function createBody(user) {
  const body = { id: user.id, phone: user.phone, phone_confirm: true };
  if (user.email) {
    body.email = user.email;
    body.email_confirm = true;
  }
  if (user.fullName) body.user_metadata = { full_name: user.fullName };
  return body;
}

async function createUser({ baseUrl, serviceKey }, user) {
  const response = await authFetch({
    baseUrl,
    serviceKey,
    route: '/auth/v1/admin/users',
    method: 'POST',
    body: createBody(user),
  });

  if (response.ok) return { status: 'created', id: response.json?.id ?? user.id };

  const code = response.json?.error_code || response.json?.code || '';
  const message = response.json?.msg || response.json?.message || response.text.slice(0, 200);
  if (response.status === 422 && /phone_exists/i.test(`${code}${message}`)) {
    return { status: 'conflict', reason: 'phone-taken', error: message };
  }
  if (response.status === 422 && /email_exists/i.test(`${code}${message}`)) {
    return { status: 'conflict', reason: 'email-taken', error: message };
  }
  if (response.status === 409) {
    return { status: 'already-exists', reason: 'exists' };
  }

  const error = new Error(`HTTP ${response.status}: ${message}`);
  error.retryable = isRetryableStatus(response.status);
  throw error;
}

function summarize(state, users) {
  const rows = users.map((user) => state.items[user.id] ?? { status: 'not-processed' });
  const count = (status) => rows.filter((row) => row.status === status).length;
  return {
    total: users.length,
    created: count('created'),
    alreadyExists: count('already-exists'),
    conflicts: count('conflict'),
    failed: count('failed'),
    notProcessed: count('not-processed'),
  };
}

function writeReports(opts, state, summary, users) {
  ensureDir(opts.stateDir);
  const generatedAt = new Date().toISOString();
  const rows = users.map((user) => {
    const item = state.items[user.id] ?? {};
    return {
      id: user.id,
      phone: maskPhone(user.phone),
      hasEmail: Boolean(user.email),
      status: item.status ?? 'not-processed',
      reason: item.reason ?? null,
      attempts: item.attempts ?? 0,
      error: item.error ?? null,
    };
  });

  const report = {
    generatedAt,
    mode: opts.execute ? 'execute' : 'dry-run',
    destinationHost: hostOf(opts.baseUrl),
    summary,
    users: rows,
  };
  writeJson(path.join(opts.stateDir, 'recreate-report.json'), report);

  const conflicts = rows.filter((row) => row.status === 'conflict');
  const failed = rows.filter((row) => row.status === 'failed');

  const lines = [
    '# Supabase Auth user recreation',
    '',
    `Generated: ${generatedAt}`,
    `Mode: **${report.mode}**`,
    `Destination: \`${report.destinationHost}\``,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Total source users | ${summary.total} |`,
    `| Created | ${summary.created} |`,
    `| Already present | ${summary.alreadyExists} |`,
    `| Conflicts | ${summary.conflicts} |`,
    `| Failed | ${summary.failed} |`,
    `| Not processed | ${summary.notProcessed} |`,
    '',
  ];

  if (conflicts.length > 0) {
    lines.push(
      '## Conflicts',
      '',
      'These phones already exist on the destination under a different id. The',
      'preserved id cannot be created while the phone is taken. Resolve by',
      'deleting the stray destination user (if it is a mistake) and re-running.',
      '',
      '| Phone (masked) | Reason |',
      '|---|---|',
      ...conflicts.map((row) => `| ${row.phone} | ${row.reason} |`),
      '',
    );
  }

  if (failed.length > 0) {
    lines.push(
      '## Failed',
      '',
      'Re-run the same command to retry only these users.',
      '',
      '| Phone (masked) | Error |',
      '|---|---|',
      ...failed.map((row) => `| ${row.phone} | ${row.error ?? ''} |`),
      '',
    );
  }

  lines.push(
    '## Verify',
    '',
    'After `--execute`, run:',
    '',
    '```bash',
    'node scripts/supabase-auth-migration/verify-users.mjs',
    '```',
    '',
  );

  ensureDir(opts.stateDir);
  writeJson(path.join(opts.stateDir, 'recreate-report.json'), report);
  writeFileSync(path.join(opts.stateDir, 'recreate-report.md'), `${lines.join('\n')}\n`, 'utf8');
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

  const host = hostOf(opts.baseUrl);
  if (host.startsWith(OLD_PROJECT_REF) && !opts.force) {
    throw new Error(
      `Refusing to run against the restricted old project (${host}). ` +
        'Point --base-url (or SUPABASE_URL) at the new project, or pass --force.',
    );
  }

  const exported = readJson(opts.usersFile);
  const allUsers = exported.users ?? [];
  const users = allUsers.slice(0, Math.min(allUsers.length, opts.limit));

  console.log(`Destination: ${host}`);
  console.log(`Source export: ${opts.usersFile} (${allUsers.length} user(s))`);
  console.log(`Mode: ${opts.execute ? 'EXECUTE' : 'dry run'}`);
  console.log('');

  // Preflight: prove the service key can read the admin user list.
  console.log('Preflight: listing destination users …');
  const existingUsers = await listAllUsers({ baseUrl: opts.baseUrl, serviceKey: opts.serviceKey });
  const existing = indexExisting(existingUsers);
  console.log(`  destination already has ${existingUsers.length} user(s).`);
  console.log('');

  const stateFile = createStateStore(opts.stateDir, opts.fresh);
  const state = existsSync(stateFile)
    ? readJson(stateFile)
    : { version: 1, destinationHost: host, startedAt: new Date().toISOString(), items: {} };
  if (state.destinationHost && state.destinationHost !== host) {
    throw new Error(
      `The state file belongs to a different destination (${state.destinationHost}). ` +
        'Re-run with --fresh after confirming the target, or point --state-dir elsewhere.',
    );
  }
  state.destinationHost = host;
  state.updatedAt = new Date().toISOString();

  const queue = users.filter(
    (user) => !(opts.resume && SUCCESS_STATUSES.has(state.items[user.id]?.status)),
  );

  // Dry run: classify and report without touching the destination.
  if (!opts.execute) {
    for (const user of users) {
      const decision = classify(user, existing);
      state.items[user.id] = {
        status: decision.action,
        reason: decision.reason ?? null,
        existingId: decision.existingId ?? null,
        phone: maskPhone(user.phone),
        updatedAt: new Date().toISOString(),
      };
    }
    writeAtomicJson(stateFile, state);
    const summary = summarize(state, users);
    writeReports(opts, state, summary, users);

    console.log('Dry run complete. Nothing was created.');
    console.log(`  would create:   ${summary.total - summary.alreadyExists - summary.conflicts}`);
    console.log(`  already exists: ${summary.alreadyExists}`);
    console.log(`  conflicts:      ${summary.conflicts}`);
    console.log(`  report:         ${path.join(opts.stateDir, 'recreate-report.md')}`);
    console.log('');
    console.log('Re-run with --execute to create the users.');
    return;
  }

  const log = createLogger(opts.stateDir, 'recreate.log');
  log(`Starting recreate: ${queue.length} queued of ${users.length} source user(s).`);
  log(`Destination: ${host}`);

  let saveChain = Promise.resolve();
  const saveState = () => {
    state.updatedAt = new Date().toISOString();
    saveChain = saveChain.then(() => writeAtomicJson(stateFile, state));
    return saveChain;
  };

  let processed = 0;
  await runPool(queue, opts.concurrency, async (user) => {
    const prefix = `[${processed + 1}/${queue.length}]`;
    try {
      const decision = classify(user, existing);
      if (decision.action === 'already-exists') {
        state.items[user.id] = {
          status: 'already-exists',
          reason: decision.reason,
          phone: maskPhone(user.phone),
          attempts: 0,
          updatedAt: new Date().toISOString(),
        };
        await saveState();
        processed += 1;
        log(`${prefix} already-present ${user.id} (${maskPhone(user.phone)})`);
        return;
      }
      if (decision.action === 'conflict') {
        state.items[user.id] = {
          status: 'conflict',
          reason: decision.reason,
          existingId: decision.existingId,
          phone: maskPhone(user.phone),
          attempts: 0,
          updatedAt: new Date().toISOString(),
        };
        await saveState();
        processed += 1;
        log(`${prefix} CONFLICT ${user.id} (${maskPhone(user.phone)}): ${decision.reason}`);
        return;
      }

      const result = await withRetry(`create ${user.id}`, () =>
        createUser({ baseUrl: opts.baseUrl, serviceKey: opts.serviceKey }, user),
      );

      state.items[user.id] = {
        status: result.status,
        reason: result.reason ?? null,
        phone: maskPhone(user.phone),
        attempts: 1,
        updatedAt: new Date().toISOString(),
      };
      await saveState();
      processed += 1;
      log(`${prefix} ${result.status} ${user.id} (${maskPhone(user.phone)})`);
    } catch (error) {
      state.items[user.id] = {
        status: 'failed',
        phone: maskPhone(user.phone),
        attempts: (state.items[user.id]?.attempts ?? 0) + 1,
        error: `${error.name ?? 'Error'}: ${error.message}`,
        updatedAt: new Date().toISOString(),
      };
      await saveState();
      processed += 1;
      log(`${prefix} FAILED ${user.id} (${maskPhone(user.phone)}): ${error.message}`);
    }
  });

  await saveChain;
  state.finishedAt = new Date().toISOString();
  await saveState();

  const summary = summarize(state, users);
  writeReports(opts, state, summary, users);

  log(
    `Done. created=${summary.created} already=${summary.alreadyExists} ` +
      `conflicts=${summary.conflicts} failed=${summary.failed}`,
  );
  log(`Report: ${path.join(opts.stateDir, 'recreate-report.md')}`);

  if (summary.failed > 0 || summary.conflicts > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nRecreate aborted: ${error.message}`);
  process.exitCode = 1;
});

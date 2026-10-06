#!/usr/bin/env node
/**
 * Composes the database and Redis connection strings at container start, then
 * hands off to the server in the same process.
 *
 * Why this exists: ECS cannot know the RDS endpoint at synth time, and the RDS
 * master password lives in Secrets Manager. The task therefore receives the
 * endpoint as plain environment variables and the password as an injected
 * secret, and the full connection URL is assembled here. Two consequences worth
 * keeping: the complete URL never exists in SSM, in a task definition, or in
 * Secrets Manager — only inside this process's memory — and rotating the RDS
 * password needs no template change.
 *
 * Both URLs are left alone when already set, so the same image runs locally with
 * DATABASE_URL/REDIS_URL and in ECS with the decomposed form.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

/** What this process should run once the URLs are composed. */
const startJob = process.env.SAMONA_START ?? 'server';
const serverDir = fileURLToPath(new URL('./', import.meta.url));

const required = (name) => {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required to compose the connection string.`);
  }
  return value;
};

/**
 * The RDS-managed secret is a JSON object, not a bare password:
 * {"username":"samona_admin","password":"…"}
 */
const composeDatabaseUrl = () => {
  const raw = process.env.DB_SECRET;
  if (raw === undefined || raw.length === 0) return undefined;

  let secret;
  try {
    secret = JSON.parse(raw);
  } catch {
    throw new Error(
      'DB_SECRET is not valid JSON. It must be the RDS-managed secret, i.e. ' +
        '{"username":"…","password":"…"}.',
    );
  }

  const password = secret.password;
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('DB_SECRET parsed as JSON but has no usable "password" field.');
  }
  const user = secret.username ?? process.env.DB_USER;
  if (typeof user !== 'string' || user.length === 0) {
    throw new Error('DB_SECRET has no "username" and DB_USER is unset.');
  }

  // Both parts are escaped. The generated password can contain @ : and /, and a
  // single unescaped character silently changes which host and database the URL
  // points at rather than failing loudly.
  //
  // sslmode=require because this URL is only ever built inside AWS: RDS accepts
  // it, and without it the connection is plaintext across the VPC.
  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  const host = required('DB_HOST');
  const port = process.env.DB_PORT ?? '5432';
  const database = required('DB_NAME');

  return `postgresql://${credentials}@${host}:${port}/${database}?schema=public&sslmode=require`;
};

/** Redis runs with TLS and AUTH, so the URL scheme is rediss:// not redis://. */
const composeRedisUrl = () => {
  const token = process.env.REDIS_AUTH_TOKEN;
  if (token === undefined || token.length === 0) return undefined;

  const host = required('REDIS_HOST');
  const port = process.env.REDIS_PORT ?? '6379';
  return `rediss://:${encodeURIComponent(token)}@${host}:${port}`;
};

process.env.DATABASE_URL ??= composeDatabaseUrl();
process.env.REDIS_URL ??= composeRedisUrl();

// Migrations need a database but not Redis, so the Redis requirement only
// applies to the server job.
if (process.env.DATABASE_URL === undefined) {
  throw new Error('Neither DATABASE_URL nor DB_SECRET was provided; cannot reach the database.');
}
if (startJob !== 'migrate' && process.env.REDIS_URL === undefined) {
  throw new Error('Neither REDIS_URL nor REDIS_AUTH_TOKEN was provided; cannot reach Redis.');
}

/**
 * Replaces the password so a URL can be logged without leaking the secret.
 * Parsed rather than pattern-matched: the Redis URL has no username
 * (`rediss://:token@host`), which a `user:pass@` regex silently skips and logs
 * the token in the clear.
 */
const redact = (value) => {
  try {
    const url = new URL(value);
    if (url.password.length > 0) url.password = 'REDACTED';
    return url.toString();
  } catch {
    return '<unparseable>';
  }
};

// Connection strings, never values: this runs on every task start and its output
// is captured by ECS, so it must stay safe to log at startup.
console.log(
  inspect({
    databaseUrl: { composed: process.env.DATABASE_URL.startsWith('postgresql://') },
    databaseSecret: process.env.DB_SECRET !== undefined,
    redisUrl: { composed: process.env.REDIS_URL.startsWith('rediss://') },
    redisAuth: process.env.REDIS_AUTH_TOKEN !== undefined,
    port: process.env.PORT ?? '4000',
  }),
);

// Opt-in, for when a task cannot reach its dependencies and the exact URL shape
// is the first thing worth checking. The password is always redacted.
if (process.env.SAMONA_LOG_URLS === '1') {
  console.log(`DATABASE_URL=${redact(process.env.DATABASE_URL)}`);
  console.log(`REDIS_URL=${redact(process.env.REDIS_URL)}`);
}

// One-off migration: hand the composed environment to the Prisma CLI and exit
// with its status. The migrate image carries the CLI; this branch is what lets
// that image reuse the same URL-composition path instead of a second one.
if (startJob === 'migrate') {
  console.log(`Starting job: prisma migrate deploy (cwd ${serverDir})`);
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: serverDir,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

await import(new URL('./dist/index.js', import.meta.url).href);

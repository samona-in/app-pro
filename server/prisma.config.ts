import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads configuration from this file rather than package.json, and no
 * longer loads `.env` automatically — so the monorepo's root `.env` is loaded
 * here for `prisma generate`, `migrate` and `studio`.
 *
 * A missing `.env` is tolerated: `prisma generate` only needs the schema, and
 * commands that genuinely require DATABASE_URL fail with their own clear error.
 */
const rootEnvPath = path.join(__dirname, '..', '.env');
try {
  process.loadEnvFile?.(rootEnvPath);
} catch {
  // No local .env yet — see .env.example.
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  // Used by migrate/introspect only. The running app connects through the
  // driver adapter in `src/database/prisma.ts`.
  //
  // DIRECT_URL exists so migrations can bypass a transaction pooler, which they
  // cannot run through. On a deployment with no pooler it is the same endpoint
  // as DATABASE_URL and is left unset. The empty-string check matters: `.env`
  // files spell unset optional values as FOO="", and `??` alone would treat
  // that as a real (empty) datasource URL.
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});

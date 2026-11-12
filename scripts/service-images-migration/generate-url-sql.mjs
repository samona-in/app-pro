#!/usr/bin/env node
/**
 * Generates the PostgreSQL URL rewrite for the Supabase -> S3 image migration.
 *
 * This script never writes to the database. With a reachable DATABASE_URL it
 * runs read-only discovery/count queries; without one (`--no-db`) it still
 * produces the SQL, because the rewrite is data-driven rather than a list of
 * hard-coded rows.
 *
 * Generated files:
 *   01-preview.sql   read-only SELECTs: old URL -> new URL, per table
 *   02-update.sql    backup table + transactional UPDATE
 *   03-rollback.sql  restore every changed row from the backup table
 *   04-verify.sql    post-migration counts and remaining old URLs
 *
 * Usage:
 *   node scripts/service-images-migration/generate-url-sql.mjs
 *   node scripts/service-images-migration/generate-url-sql.mjs --no-db
 *
 * Defaults match the staging bucket; override for another environment:
 *   --old-base https://<project>.supabase.co/storage/v1/object/public/services/
 *   --new-base https://<bucket>.s3.<region>.amazonaws.com/services/
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from './env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = loadEnv();

const OLD_BASE_DEFAULT =
  'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/';
const NEW_BASE_DEFAULT =
  'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/';

/**
 * Every column that carries an absolute image URL in the current schema.
 *
 * `service_work_groups.image_url` normally holds `asset://...` references, but
 * one row uses the Supabase bucket today. `banners` and
 * `notification_campaigns` hold images too; they have no Supabase
 * `services` URLs right now, and they are included so the rewrite is complete
 * if production differs from development.
 */
const TARGETS = [
  { table: 'services', column: 'icon', id: 'id' },
  { table: 'skills', column: 'icon', id: 'id' },
  { table: 'service_work_groups', column: 'image_url', id: 'id' },
  { table: 'banners', column: 'image', id: 'id' },
  { table: 'notification_campaigns', column: 'image_url', id: 'id' },
];

const BACKUP_TABLE = 'service_image_url_backup';
const IMAGE_EXTENSIONS_REGEX = '[.](png|jpe?g|webp)$';

function usage() {
  console.log(`Generate PostgreSQL URL migration + rollback scripts.

Options:
  --old-base <url>       Supabase public base URL (default ${OLD_BASE_DEFAULT})
  --new-base <url>       S3 public base URL (default ${NEW_BASE_DEFAULT})
  --out-dir <path>       SQL output directory
  --database-url <url>   Read-only verification connection (default DATABASE_URL)
  --no-db                Skip database discovery/counts
  --no-ssl               Disable TLS for the verification connection
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    oldBase: OLD_BASE_DEFAULT,
    newBase: NEW_BASE_DEFAULT,
    outDir: path.join(HERE, 'sql'),
    databaseUrl: ENV.DATABASE_URL,
    checkDb: true,
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
      case '--old-base':
        opts.oldBase = value();
        break;
      case '--new-base':
        opts.newBase = value();
        break;
      case '--out-dir':
        opts.outDir = path.resolve(value());
        break;
      case '--database-url':
        opts.databaseUrl = value();
        break;
      case '--no-db':
        opts.checkDb = false;
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

  if (!opts.oldBase.endsWith('/')) opts.oldBase += '/';
  if (!opts.newBase.endsWith('/')) opts.newBase += '/';
  return opts;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

/** Exact prefix match; avoids regex metacharacters in the base URL entirely. */
function prefixCondition(target, oldBase) {
  const column = quoteIdent(target.column);
  return `left(${column}, length(${sqlLiteral(oldBase)})) = ${sqlLiteral(oldBase)}`;
}

function extensionCondition(target) {
  return `${quoteIdent(target.column)} ~* ${sqlLiteral(IMAGE_EXTENSIONS_REGEX)}`;
}

/** Replaces the base URL and the final image extension, nothing else. */
function newValueExpression(target, oldBase, newBase) {
  const column = quoteIdent(target.column);
  return `regexp_replace(${sqlLiteral(newBase)} || substr(${column}, length(${sqlLiteral(oldBase)}) + 1), ${sqlLiteral(IMAGE_EXTENSIONS_REGEX)}, '.webp', 'i')`;
}

function affectedWhere(target, oldBase) {
  return `${prefixCondition(target, oldBase)}\n  AND ${extensionCondition(target)}`;
}

function previewSql(opts) {
  const blocks = [
    '-- Read-only preview. Run this first and inspect every row.',
    '-- Nothing here writes to the database.',
    '\\set ON_ERROR_STOP on',
    '',
    '-- Distinct affected URLs and how many rows use each one.',
    'SELECT value AS old_url, count(*) AS rows',
    'FROM (',
    ...TARGETS.map(
      (target, index) =>
        `  ${index === 0 ? '' : 'UNION ALL '}SELECT ${quoteIdent(target.column)} AS value FROM ${quoteIdent(target.table)}\n  WHERE ${affectedWhere(target, opts.oldBase)}`,
    ),
    ') AS affected',
    'GROUP BY value',
    'ORDER BY rows DESC, old_url;',
    '',
  ];

  for (const target of TARGETS) {
    blocks.push(
      `-- ${target.table}.${target.column}`,
      'SELECT',
      `  ${sqlLiteral(target.table)} AS table_name,`,
      `  ${quoteIdent(target.id)}::text AS row_id,`,
      `  ${quoteIdent(target.column)} AS old_url,`,
      `  ${newValueExpression(target, opts.oldBase, opts.newBase)} AS new_url`,
      `FROM ${quoteIdent(target.table)}`,
      `WHERE ${affectedWhere(target, opts.oldBase)}`,
      `ORDER BY ${quoteIdent(target.id)};`,
      '',
    );
  }

  return blocks.join('\n');
}

function backupTableSql() {
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(BACKUP_TABLE)} (
  "table_name"   text NOT NULL,
  "row_id"       uuid NOT NULL,
  "column_name"  text NOT NULL,
  "original_value" text NOT NULL,
  "new_value"    text NOT NULL,
  "migrated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ${quoteIdent(`${BACKUP_TABLE}_pkey`)}
    PRIMARY KEY ("table_name", "row_id", "column_name")
);

COMMENT ON TABLE ${quoteIdent(BACKUP_TABLE)} IS
  'Original values for the Supabase services -> S3 WebP URL rewrite. Used by 03-rollback.sql.';
`;
}

function updateSql(opts, counts) {
  const blocks = [
    '-- Applies the Supabase services -> AWS S3 WebP URL rewrite.',
    '--',
    '-- Safety:',
    '--   * Only values that start with the exact Supabase base URL are touched.',
    '--   * Nested paths and URL encoding are preserved; only the base and the',
    '--     final image extension change.',
    '--   * Original values are copied to service_image_url_backup in the same',
    '--     transaction, so 03-rollback.sql can restore them exactly.',
    '--   * Re-running is safe: the WHERE clause no longer matches migrated rows.',
    '\\set ON_ERROR_STOP on',
    '',
    'BEGIN;',
    '',
    backupTableSql(),
  ];

  for (const target of TARGETS) {
    const count = counts?.get(`${target.table}.${target.column}`);
    blocks.push(
      `-- ${target.table}.${target.column}: ${count === undefined ? 'count not checked' : `${count} row(s)`}`,
      `INSERT INTO ${quoteIdent(BACKUP_TABLE)} ("table_name", "row_id", "column_name", "original_value", "new_value")`,
      'SELECT',
      `  ${sqlLiteral(target.table)},`,
      `  ${quoteIdent(target.id)},`,
      `  ${sqlLiteral(target.column)},`,
      `  ${quoteIdent(target.column)},`,
      `  ${newValueExpression(target, opts.oldBase, opts.newBase)}`,
      `FROM ${quoteIdent(target.table)}`,
      `WHERE ${affectedWhere(target, opts.oldBase)}`,
      'ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;',
      '',
      `UPDATE ${quoteIdent(target.table)}`,
      `SET ${quoteIdent(target.column)} = ${newValueExpression(target, opts.oldBase, opts.newBase)}`,
      `WHERE ${affectedWhere(target, opts.oldBase)};`,
      '',
    );
  }

  blocks.push('COMMIT;', '', '-- Run 04-verify.sql next.', '');
  return blocks.join('\n');
}

function rollbackSql() {
  const blocks = [
    '-- Restores the exact original URLs recorded by 02-update.sql.',
    '--',
    '-- Only rows that still hold the migrated value are restored. A value that',
    '-- was edited by hand after the migration is left alone and surfaced by the',
    '-- final query, so rollback cannot silently clobber newer work.',
    '\\set ON_ERROR_STOP on',
    '',
    'BEGIN;',
    '',
    backupTableSql(),
  ];

  for (const target of TARGETS) {
    blocks.push(
      `-- ${target.table}.${target.column}`,
      `UPDATE ${quoteIdent(target.table)} AS t`,
      `SET ${quoteIdent(target.column)} = b."original_value"`,
      `FROM ${quoteIdent(BACKUP_TABLE)} AS b`,
      `WHERE b."table_name" = ${sqlLiteral(target.table)}`,
      `  AND b."column_name" = ${sqlLiteral(target.column)}`,
      `  AND t.${quoteIdent(target.id)} = b."row_id"`,
      `  AND t.${quoteIdent(target.column)} = b."new_value";`,
      '',
    );
  }

  blocks.push(
    '-- Rows changed after the migration: not rolled back, inspect manually.',
    'SELECT b."table_name", b."column_name", b."row_id",',
    '       b."original_value", b."new_value", t."value" AS current_value',
    'FROM service_image_url_backup b',
    `JOIN LATERAL (`,
    ...TARGETS.map(
      (target, index) =>
        `${index === 0 ? '' : '  UNION ALL '}SELECT ${sqlLiteral(target.table)} AS table_name, ${sqlLiteral(target.column)} AS column_name, ${quoteIdent(target.id)} AS row_id, ${quoteIdent(target.column)} AS value FROM ${quoteIdent(target.table)}`,
    ),
    ') AS t ON t."table_name" = b."table_name" AND t."column_name" = b."column_name" AND t."row_id" = b."row_id"',
    'WHERE t."value" IS DISTINCT FROM b."new_value"',
    '  AND t."value" IS DISTINCT FROM b."original_value";',
    '',
    'COMMIT;',
    '',
    '-- Optional, only after the rollback is confirmed:',
    `-- DROP TABLE ${quoteIdent(BACKUP_TABLE)};`,
    '',
  );
  return blocks.join('\n');
}

function verifySql(opts) {
  const blocks = [
    '-- Post-migration verification. Read-only.',
    '\\set ON_ERROR_STOP on',
    '',
    '-- No Supabase services URL should remain in any target column.',
  ];

  for (const target of TARGETS) {
    blocks.push(
      `SELECT ${sqlLiteral(`${target.table}.${target.column}`)} AS target,`,
      `       count(*) AS remaining_old_urls`,
      `FROM ${quoteIdent(target.table)}`,
      `WHERE ${affectedWhere(target, opts.oldBase)};`,
      '',
    );
  }

  blocks.push(
    '-- Rows actually rewritten, grouped by table and column.',
    'SELECT "table_name", "column_name", count(*) AS rows, min("migrated_at") AS first_migrated_at',
    `FROM ${quoteIdent(BACKUP_TABLE)}`,
    'GROUP BY "table_name", "column_name"',
    'ORDER BY "table_name", "column_name";',
    '',
    '-- Rows that no longer equal either the original or the migrated value.',
    'SELECT b."table_name", b."column_name", b."row_id"',
    'FROM service_image_url_backup b',
    'JOIN LATERAL (',
    '  SELECT * FROM (',
    ...TARGETS.map(
      (target, index) =>
        `${index === 0 ? '' : '    UNION ALL '}SELECT ${sqlLiteral(target.table)} AS table_name, ${sqlLiteral(target.column)} AS column_name, ${quoteIdent(target.id)} AS row_id, ${quoteIdent(target.column)} AS value FROM ${quoteIdent(target.table)}`,
    ),
    '  ) AS unioned',
    ') AS t ON t."table_name" = b."table_name" AND t."column_name" = b."column_name" AND t."row_id" = b."row_id"',
    'WHERE t."value" IS DISTINCT FROM b."original_value"',
    '  AND t."value" IS DISTINCT FROM b."new_value";',
    '',
    '-- Sample of the new S3 URLs.',
  );

  for (const target of TARGETS) {
    blocks.push(
      `SELECT ${sqlLiteral(`${target.table}.${target.column}`)} AS target, ${quoteIdent(target.column)} AS url`,
      `FROM ${quoteIdent(target.table)}`,
      `WHERE ${quoteIdent(target.column)} LIKE ${sqlLiteral(`${opts.newBase}%`)}`,
      'LIMIT 5;',
      '',
    );
  }

  return blocks.join('\n');
}

async function discoverDatabase(opts) {
  const client = new pg.Client({
    connectionString: opts.databaseUrl,
    ssl: opts.ssl ? { rejectUnauthorized: false } : undefined,
  });

  console.log('Connecting to the database read-only for discovery …');
  await client.connect();

  const counts = new Map();
  try {
    for (const target of TARGETS) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS count FROM ${quoteIdent(target.table)} WHERE ${affectedWhere(target, opts.oldBase)}`,
      );
      counts.set(`${target.table}.${target.column}`, rows[0].count);
    }

    console.log('\nAffected rows by column:');
    for (const target of TARGETS) {
      const key = `${target.table}.${target.column}`;
      console.log(`  ${key.padEnd(42)} ${counts.get(key)}`);
    }

    // Discover any image-like text column outside TARGETS that also holds the
    // old base. This is a warning, not an automatic rewrite: a column this
    // script was not taught about must be reviewed before SQL changes it.
    const { rows: columns } = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'ARRAY')
        AND column_name ~* 'image|icon|url|photo|avatar|picture|thumbnail|logo|banner'
      ORDER BY table_name, column_name
    `);

    const known = new Set(TARGETS.map((target) => `${target.table}.${target.column}`));
    const extra = [];
    for (const column of columns) {
      const key = `${column.table_name}.${column.column_name}`;
      if (known.has(key)) continue;
      const expression =
        column.data_type === 'ARRAY'
          ? `array_to_string(${quoteIdent(column.column_name)}, ',')`
          : `${quoteIdent(column.column_name)}::text`;
      const { rows } = await client.query(
        `SELECT count(*)::int AS count FROM ${quoteIdent(column.table_name)} WHERE ${expression} LIKE ${sqlLiteral(`${opts.oldBase}%`)}`,
      );
      if (rows[0].count > 0) extra.push({ key, count: rows[0].count, type: column.data_type });
    }

    if (extra.length > 0) {
      console.log('\nWARNING: other columns also reference the Supabase services bucket:');
      for (const column of extra) {
        console.log(`  ${column.key} (${column.type}): ${column.count} row(s)`);
      }
      console.log('These are not rewritten by the generated SQL. Review them manually.');
    } else {
      console.log('\nNo image-like column outside the known targets references the bucket.');
    }

    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    console.log(`\nTotal affected rows: ${total}`);
    return counts;
  } finally {
    await client.end();
  }
}

function writeFile(file, contents) {
  writeFileSync(file, `${contents.trimEnd()}\n`, 'utf8');
  console.log(`  wrote ${file}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.outDir)) mkdirSync(opts.outDir, { recursive: true });

  let counts;
  if (opts.checkDb) {
    if (!opts.databaseUrl) {
      console.warn('DATABASE_URL is not set; skipping database discovery. SQL is still generated.');
    } else {
      try {
        counts = await discoverDatabase(opts);
      } catch (error) {
        console.warn(
          `Database discovery failed (${error.message}). SQL is still generated; run 01-preview.sql against the target database before updating.`,
        );
      }
    }
  }

  console.log(`\nWriting SQL to ${opts.outDir}`);
  writeFile(path.join(opts.outDir, '01-preview.sql'), previewSql(opts));
  writeFile(path.join(opts.outDir, '02-update.sql'), updateSql(opts, counts));
  writeFile(path.join(opts.outDir, '03-rollback.sql'), rollbackSql());
  writeFile(path.join(opts.outDir, '04-verify.sql'), verifySql(opts));

  console.log('\nNext:');
  console.log('  1. Review 01-preview.sql and run it against development.');
  console.log('  2. Apply the same script to production only after reviewing the preview.');
  console.log('  3. Keep service_image_url_backup until the migration is signed off.');
  console.log('  4. 03-rollback.sql restores the exact original values.');
}

main().catch((error) => {
  console.error(`\nSQL generation failed: ${error.message}`);
  process.exitCode = 1;
});

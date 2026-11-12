# Service image migration: Supabase Storage → AWS S3 (WebP)

Migrates the Supabase Storage `services` bucket to the AWS S3 bucket
`samona-staging-services-072842665972` in `us-east-1`, preserving every folder,
filename and URL encoding while converting each image to WebP under 50 KB.

The source bucket is only read. Nothing is deleted or modified there, and no
database record is changed by the migration script.

## What the source contains

| | |
|---|---|
| Objects | 385 |
| Total size | ~667.5 MB |
| Formats | 342 PNG, 43 JPEG |
| Top-level folders | `AC and Applications`, `desktop & pc repair`, `laptops&electronis`, `paintings`, `printer`, `wifi-networking`, plus 281 root files |
| Destination collisions | none after changing the extension to `.webp` |

Destination:

```text
https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/<same path>/<same name>.webp
```

## Prerequisites

- Node.js 20+ (the repo already requires 20.19+).
- `sharp` is declared in the root `devDependencies`.
- AWS credentials for the migration account in the ambient provider chain
  (`aws sts get-caller-identity` must work). No credentials are read from this
  directory or written to metadata/logs.
- The Supabase S3 gateway settings already present in `.env`:
  `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`.
- For SQL generation only: `DATABASE_URL` in `.env` (read-only use).

## 1. Create the bucket (once)

The bucket does not exist yet in the account. This creates it, enables SSE-S3,
blocks public ACLs/listing, and grants anonymous `GetObject` **only** on
`services/*`:

```bash
./scripts/service-images-migration/create-bucket.sh
```

Override the bucket/region if needed:

```bash
./scripts/service-images-migration/create-bucket.sh <bucket> <region>
```

> The existing CDK stack in `infra/` does not define this bucket yet. Creating it
> by CLI is intentional for this migration; add it to `staging-stack.ts` as a
> follow-up so a future `cdk deploy` owns its lifecycle. Do not deploy the stack
> with a new bucket resource while this CLI-created bucket exists — CloudFormation
> would try to create it again.

## 2. Dry run

Dry runs are the default. Nothing is uploaded.

```bash
# List everything, validate collisions, no downloads
node scripts/service-images-migration/migrate-service-images.mjs

# Also download and optimize a sample so real output sizes are visible
node scripts/service-images-migration/migrate-service-images.mjs --dry-run --sample 10
```

Outputs:

- `reports/dry-run-report.md`
- `reports/dry-run-report.json`

Review the sample sizes before executing. The optimizer starts at quality 80 at
up to 1280 px, lowers quality to 65, then steps the longest edge down through
1024, 896, 800 and 640 px. It never enlarges an image and never goes below 640 px.
If a file still exceeds 50 KB at 640 px / quality 50, it is uploaded at that
setting and reported as **above target** instead of being degraded further.

## 3. Execute

```bash
node scripts/service-images-migration/migrate-service-images.mjs --execute --concurrency 4
```

Useful flags:

| Flag | Meaning |
|---|---|
| `--limit N` | Process only the first N images |
| `--concurrency N` | Parallel workers, default 4, max 16 |
| `--fresh` | Archive the previous state and start over |
| `--no-resume` | Re-check every image even if state says it succeeded |
| `--overwrite-existing` | Replace a conflicting object not created by this migration |
| `--state-dir`, `--reports-dir` | Override artifact locations |
| `--bucket`, `--region` | Override the destination |

Behaviour that makes interruption safe:

- Every image is recorded in `.state/state.json` before/after each attempt.
- Re-running the same command resumes: successfully uploaded images are skipped.
- An existing destination object is `HEAD`ed first. If it carries the
  `migrated-from` metadata written by this script, it is verified and skipped. If
  it is foreign, it is reported as a **conflict** and left untouched.
- Every upload is verified with `HeadObject` for exact `ContentLength` and
  `Content-Type: image/webp`.
- Downloads and uploads retry with exponential backoff.

Outputs:

- `reports/migration-report.md` / `.json` — the requested metrics
- `reports/failed.json` — failed and conflicted images, with errors
- `reports/url-map.json` — source key → destination key → public URL
- `.state/migration.log` — one line per processed image (no credentials)

## 4. Verify

The report includes verification results. Spot-check a few public URLs:

```bash
curl -I 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/2-pin%20plug%20replacement.webp'
```

Expected: `200`, `Content-Type: image/webp`, `Content-Length` below 51200 for
almost every object, and the `x-amz-meta-migrated-from` header.

## 5. Generate SQL

```bash
node scripts/service-images-migration/generate-url-sql.mjs
```

This connects read-only to `DATABASE_URL`, prints affected-row counts, and
writes four files to `sql/`:

| File | Purpose |
|---|---|
| `01-preview.sql` | `SELECT` old → new URLs per table; run and inspect first |
| `02-update.sql` | Transactional backup + `UPDATE` |
| `03-rollback.sql` | Restores the exact original values from the backup table |
| `04-verify.sql` | Post-update counts and any remaining old URLs |

The current development database has:

| Table.column | Affected rows |
|---|---|
| `services.icon` | 9 |
| `skills.icon` | 36 |
| `service_work_groups.image_url` | 1 |
| `banners.image` | 0 |
| `notification_campaigns.image_url` | 0 |

The generator also scans every image-like text column and warns if another
column references the bucket. It never updates anything itself.

Apply against development first:

```bash
psql "$DATABASE_URL" -f scripts/service-images-migration/sql/01-preview.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/service-images-migration/sql/02-update.sql
psql "$DATABASE_URL" -f scripts/service-images-migration/sql/04-verify.sql
```

For production, run the same files against the RDS connection. The SQL is
data-driven, so it applies to whatever rows exist there; it is not a list of
development IDs. **Do not run it automatically** — the migration script does not
touch the database.

### Rollback

```bash
psql "$RDS_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/service-images-migration/sql/03-rollback.sql
```

`02-update.sql` copies every original value into `service_image_url_backup` in
the same transaction. Rollback restores only rows that still hold the migrated
value; a value edited by hand after migration is left alone and listed at the
end of the rollback output.

Keep the backup table until the migration is signed off. Drop it only after
that.

## Environment variables

No new variables are required. The migration reuses:

| Variable | Use |
|---|---|
| `S3_ENDPOINT` | Supabase S3 gateway for the source |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Source gateway credentials |
| `S3_REGION` | Source gateway region |
| `S3_FORCE_PATH_STYLE` | Source gateway addressing |
| `DATABASE_URL` | Read-only discovery for SQL generation |
| `S3_BUCKET_SERVICES` | Optional override for the destination bucket name |

Destination AWS credentials come from the ambient provider chain, never from
`.env` or the command line.

## Why not upload from the app's storage service?

`server/src/files/storage.service.ts` is built for presigned client uploads and
domain-scoped paths (`pros/…`, `jobs/…`, avatars, documents). Migrating existing
catalogue images is a one-off batch job with different needs: source-side
listing, image transcoding, resumable state and conflict detection. It reuses
the same bucket configuration and SDK, but stays outside the request path.

## Safety checklist

- [x] Dry run before upload
- [x] Source objects never deleted or modified
- [x] Existing destination objects checked before write
- [x] No automatic database update
- [x] Preview SQL before update
- [x] Backup + rollback SQL
- [x] Upload size and content type verified
- [x] Per-image log and failed-image report
- [x] Public read limited to `services/*`
- [x] No credentials in logs or S3 metadata

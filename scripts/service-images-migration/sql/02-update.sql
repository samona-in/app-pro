-- Applies the Supabase services -> AWS S3 WebP URL rewrite.
--
-- Safety:
--   * Only values that start with the exact Supabase base URL are touched.
--   * Nested paths and URL encoding are preserved; only the base and the
--     final image extension change.
--   * Original values are copied to service_image_url_backup in the same
--     transaction, so 03-rollback.sql can restore them exactly.
--   * Re-running is safe: the WHERE clause no longer matches migrated rows.
\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS "service_image_url_backup" (
  "table_name"   text NOT NULL,
  "row_id"       uuid NOT NULL,
  "column_name"  text NOT NULL,
  "original_value" text NOT NULL,
  "new_value"    text NOT NULL,
  "migrated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "service_image_url_backup_pkey"
    PRIMARY KEY ("table_name", "row_id", "column_name")
);

COMMENT ON TABLE "service_image_url_backup" IS
  'Original values for the Supabase services -> S3 WebP URL rewrite. Used by 03-rollback.sql.';

-- services.icon: 9 row(s)
INSERT INTO "service_image_url_backup" ("table_name", "row_id", "column_name", "original_value", "new_value")
SELECT
  'services',
  "id",
  'icon',
  "icon",
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
FROM "services"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;

UPDATE "services"
SET "icon" = regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$';

-- skills.icon: 36 row(s)
INSERT INTO "service_image_url_backup" ("table_name", "row_id", "column_name", "original_value", "new_value")
SELECT
  'skills',
  "id",
  'icon',
  "icon",
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
FROM "skills"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;

UPDATE "skills"
SET "icon" = regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$';

-- service_work_groups.image_url: 1 row(s)
INSERT INTO "service_image_url_backup" ("table_name", "row_id", "column_name", "original_value", "new_value")
SELECT
  'service_work_groups',
  "id",
  'image_url',
  "image_url",
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
FROM "service_work_groups"
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$'
ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;

UPDATE "service_work_groups"
SET "image_url" = regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$';

-- banners.image: 0 row(s)
INSERT INTO "service_image_url_backup" ("table_name", "row_id", "column_name", "original_value", "new_value")
SELECT
  'banners',
  "id",
  'image',
  "image",
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
FROM "banners"
WHERE left("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image" ~* '[.](png|jpe?g|webp)$'
ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;

UPDATE "banners"
SET "image" = regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
WHERE left("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image" ~* '[.](png|jpe?g|webp)$';

-- notification_campaigns.image_url: 0 row(s)
INSERT INTO "service_image_url_backup" ("table_name", "row_id", "column_name", "original_value", "new_value")
SELECT
  'notification_campaigns',
  "id",
  'image_url',
  "image_url",
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
FROM "notification_campaigns"
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$'
ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;

UPDATE "notification_campaigns"
SET "image_url" = regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i')
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$';

COMMIT;

-- Run 04-verify.sql next.

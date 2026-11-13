-- Restores the exact original URLs recorded by 02-update.sql.
--
-- Only rows that still hold the migrated value are restored. A value that
-- was edited by hand after the migration is left alone and surfaced by the
-- final query, so rollback cannot silently clobber newer work.
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

-- services.icon
UPDATE "services" AS t
SET "icon" = b."original_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'services'
  AND b."column_name" = 'icon'
  AND t."id" = b."row_id"
  AND t."icon" = b."new_value";

-- skills.icon
UPDATE "skills" AS t
SET "icon" = b."original_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'skills'
  AND b."column_name" = 'icon'
  AND t."id" = b."row_id"
  AND t."icon" = b."new_value";

-- service_work_groups.image_url
UPDATE "service_work_groups" AS t
SET "image_url" = b."original_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'service_work_groups'
  AND b."column_name" = 'image_url'
  AND t."id" = b."row_id"
  AND t."image_url" = b."new_value";

-- banners.image
UPDATE "banners" AS t
SET "image" = b."original_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'banners'
  AND b."column_name" = 'image'
  AND t."id" = b."row_id"
  AND t."image" = b."new_value";

-- notification_campaigns.image_url
UPDATE "notification_campaigns" AS t
SET "image_url" = b."original_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'notification_campaigns'
  AND b."column_name" = 'image_url'
  AND t."id" = b."row_id"
  AND t."image_url" = b."new_value";

-- Rows changed after the migration: not rolled back, inspect manually.
SELECT b."table_name", b."column_name", b."row_id",
       b."original_value", b."new_value", t."value" AS current_value
FROM service_image_url_backup b
JOIN LATERAL (
SELECT 'services' AS table_name, 'icon' AS column_name, "id" AS row_id, "icon" AS value FROM "services"
  UNION ALL SELECT 'skills' AS table_name, 'icon' AS column_name, "id" AS row_id, "icon" AS value FROM "skills"
  UNION ALL SELECT 'service_work_groups' AS table_name, 'image_url' AS column_name, "id" AS row_id, "image_url" AS value FROM "service_work_groups"
  UNION ALL SELECT 'banners' AS table_name, 'image' AS column_name, "id" AS row_id, "image" AS value FROM "banners"
  UNION ALL SELECT 'notification_campaigns' AS table_name, 'image_url' AS column_name, "id" AS row_id, "image_url" AS value FROM "notification_campaigns"
) AS t ON t."table_name" = b."table_name" AND t."column_name" = b."column_name" AND t."row_id" = b."row_id"
WHERE t."value" IS DISTINCT FROM b."new_value"
  AND t."value" IS DISTINCT FROM b."original_value";

COMMIT;

-- Optional, only after the rollback is confirmed:
-- DROP TABLE "service_image_url_backup";

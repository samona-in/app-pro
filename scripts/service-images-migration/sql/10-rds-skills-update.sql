-- ============================================================================
-- RDS: public.skills.icon  Supabase Storage -> AWS S3 (WebP)
-- ============================================================================
-- Validated against a CSV export of public.skills on RDS:
--
--   total rows ......................... 413
--   icons on Supabase ................. 376  (320 distinct images)
--   NULL icons ........................ 37
--   already on S3 ..................... 0
--   Supabase URLs missing from S3 ..... 0
--
-- Expected run time: ~1-3 seconds for a table this size.
--
-- The rewrite is data-driven: it applies to whatever rows exist in the target
-- database. Only values that start with the exact Supabase base URL and end in
-- an image extension are touched.
--
-- A literal '+' in an S3 path is decoded as a space by the S3 HTTP front end,
-- which returns 403, so it is stored as '%2B'. Already-encoded values such as
-- '%20' are left alone.
--
-- No psql meta-commands are used, so this file can be pasted into pgAdmin 4.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Backup table (shared by every table in this migration)
-- ----------------------------------------------------------------------------
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
  'Original values for the Supabase services -> S3 WebP URL rewrite. Used by 11-rds-skills-rollback.sql.';

-- ----------------------------------------------------------------------------
-- 2. Snapshot the exact original values that will change
-- ----------------------------------------------------------------------------
INSERT INTO "service_image_url_backup" ("table_name", "row_id", "column_name", "original_value", "new_value")
SELECT
  'skills',
  "id",
  'icon',
  "icon",
  regexp_replace(
    'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/'
    || replace(
         substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1),
         '+', '%2B'
       ),
    '[.](png|jpe?g|webp)$', '.webp', 'i'
  )
FROM "skills"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
ON CONFLICT ("table_name", "row_id", "column_name") DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Apply, only if the row still holds the backed-up original
-- ----------------------------------------------------------------------------
UPDATE "skills" AS s
SET "icon" = b."new_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'skills'
  AND b."column_name" = 'icon'
  AND s."id" = b."row_id"
  AND s."icon" = b."original_value";

-- ----------------------------------------------------------------------------
-- 4. Abort instead of leaving a half-migrated table
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM "skills"
  WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/';

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'Aborting: % skills.icon value(s) still point at Supabase. Migrate those images first, or remove them from the WHERE clause.',
      remaining;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Summary shown before COMMIT
-- ----------------------------------------------------------------------------
SELECT
  count(*)                                                                                    AS total_rows,
  count(*) FILTER (WHERE "icon" IS NULL)                                                      AS null_icons,
  count(*) FILTER (WHERE "icon" LIKE 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/%') AS on_s3,
  count(*) FILTER (WHERE "icon" LIKE 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/%')      AS on_supabase
FROM "skills";

COMMIT;

-- Run 11-rds-skills-rollback.sql only if you need to revert.

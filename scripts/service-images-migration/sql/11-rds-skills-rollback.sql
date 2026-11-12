-- ============================================================================
-- RDS: revert public.skills.icon from AWS S3 back to Supabase Storage
-- ============================================================================
-- Restores the exact values recorded in service_image_url_backup by
-- 10-rds-skills-update.sql.
--
-- Only rows that still hold the migrated value are restored. A value edited by
-- hand after the migration is left alone and listed by the final query, so the
-- rollback cannot silently clobber newer work.
--
-- No psql meta-commands are used, so this file can be pasted into pgAdmin 4.
-- ============================================================================

BEGIN;

UPDATE "skills" AS s
SET "icon" = b."original_value"
FROM "service_image_url_backup" AS b
WHERE b."table_name" = 'skills'
  AND b."column_name" = 'icon'
  AND s."id" = b."row_id"
  AND s."icon" = b."new_value";

-- Rows changed after the migration: not restored, review manually.
SELECT b."row_id", b."original_value", b."new_value", s."icon" AS current_value
FROM "service_image_url_backup" AS b
JOIN "skills" AS s ON s."id" = b."row_id"
WHERE b."table_name" = 'skills'
  AND b."column_name" = 'icon'
  AND s."icon" IS DISTINCT FROM b."new_value"
  AND s."icon" IS DISTINCT FROM b."original_value";

COMMIT;

-- Optional, only after the rollback is confirmed:
-- DROP TABLE "service_image_url_backup";

-- Post-migration verification. Read-only.
\set ON_ERROR_STOP on

-- No Supabase services URL should remain in any target column.
SELECT 'services.icon' AS target,
       count(*) AS remaining_old_urls
FROM "services"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$';

SELECT 'skills.icon' AS target,
       count(*) AS remaining_old_urls
FROM "skills"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$';

SELECT 'service_work_groups.image_url' AS target,
       count(*) AS remaining_old_urls
FROM "service_work_groups"
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$';

SELECT 'banners.image' AS target,
       count(*) AS remaining_old_urls
FROM "banners"
WHERE left("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image" ~* '[.](png|jpe?g|webp)$';

SELECT 'notification_campaigns.image_url' AS target,
       count(*) AS remaining_old_urls
FROM "notification_campaigns"
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$';

-- Rows actually rewritten, grouped by table and column.
SELECT "table_name", "column_name", count(*) AS rows, min("migrated_at") AS first_migrated_at
FROM "service_image_url_backup"
GROUP BY "table_name", "column_name"
ORDER BY "table_name", "column_name";

-- Rows that no longer equal either the original or the migrated value.
SELECT b."table_name", b."column_name", b."row_id"
FROM service_image_url_backup b
JOIN LATERAL (
  SELECT * FROM (
SELECT 'services' AS table_name, 'icon' AS column_name, "id" AS row_id, "icon" AS value FROM "services"
    UNION ALL SELECT 'skills' AS table_name, 'icon' AS column_name, "id" AS row_id, "icon" AS value FROM "skills"
    UNION ALL SELECT 'service_work_groups' AS table_name, 'image_url' AS column_name, "id" AS row_id, "image_url" AS value FROM "service_work_groups"
    UNION ALL SELECT 'banners' AS table_name, 'image' AS column_name, "id" AS row_id, "image" AS value FROM "banners"
    UNION ALL SELECT 'notification_campaigns' AS table_name, 'image_url' AS column_name, "id" AS row_id, "image_url" AS value FROM "notification_campaigns"
  ) AS unioned
) AS t ON t."table_name" = b."table_name" AND t."column_name" = b."column_name" AND t."row_id" = b."row_id"
WHERE t."value" IS DISTINCT FROM b."original_value"
  AND t."value" IS DISTINCT FROM b."new_value";

-- Sample of the new S3 URLs.
SELECT 'services.icon' AS target, "icon" AS url
FROM "services"
WHERE "icon" LIKE 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/%'
LIMIT 5;

SELECT 'skills.icon' AS target, "icon" AS url
FROM "skills"
WHERE "icon" LIKE 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/%'
LIMIT 5;

SELECT 'service_work_groups.image_url' AS target, "image_url" AS url
FROM "service_work_groups"
WHERE "image_url" LIKE 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/%'
LIMIT 5;

SELECT 'banners.image' AS target, "image" AS url
FROM "banners"
WHERE "image" LIKE 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/%'
LIMIT 5;

SELECT 'notification_campaigns.image_url' AS target, "image_url" AS url
FROM "notification_campaigns"
WHERE "image_url" LIKE 'https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/%'
LIMIT 5;

-- Read-only preview. Run this first and inspect every row.
-- Nothing here writes to the database.
\set ON_ERROR_STOP on

-- Distinct affected URLs and how many rows use each one.
SELECT value AS old_url, count(*) AS rows
FROM (
  SELECT "icon" AS value FROM "services"
  WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
  UNION ALL SELECT "icon" AS value FROM "skills"
  WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
  UNION ALL SELECT "image_url" AS value FROM "service_work_groups"
  WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$'
  UNION ALL SELECT "image" AS value FROM "banners"
  WHERE left("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image" ~* '[.](png|jpe?g|webp)$'
  UNION ALL SELECT "image_url" AS value FROM "notification_campaigns"
  WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$'
) AS affected
GROUP BY value
ORDER BY rows DESC, old_url;

-- services.icon
SELECT
  'services' AS table_name,
  "id"::text AS row_id,
  "icon" AS old_url,
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i') AS new_url
FROM "services"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
ORDER BY "id";

-- skills.icon
SELECT
  'skills' AS table_name,
  "id"::text AS row_id,
  "icon" AS old_url,
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i') AS new_url
FROM "skills"
WHERE left("icon", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "icon" ~* '[.](png|jpe?g|webp)$'
ORDER BY "id";

-- service_work_groups.image_url
SELECT
  'service_work_groups' AS table_name,
  "id"::text AS row_id,
  "image_url" AS old_url,
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i') AS new_url
FROM "service_work_groups"
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$'
ORDER BY "id";

-- banners.image
SELECT
  'banners' AS table_name,
  "id"::text AS row_id,
  "image" AS old_url,
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i') AS new_url
FROM "banners"
WHERE left("image", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image" ~* '[.](png|jpe?g|webp)$'
ORDER BY "id";

-- notification_campaigns.image_url
SELECT
  'notification_campaigns' AS table_name,
  "id"::text AS row_id,
  "image_url" AS old_url,
  regexp_replace('https://samona-staging-services-072842665972.s3.us-east-1.amazonaws.com/services/' || replace(substr("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/') + 1), '+', '%2B'), '[.](png|jpe?g|webp)$', '.webp', 'i') AS new_url
FROM "notification_campaigns"
WHERE left("image_url", length('https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/')) = 'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/'
  AND "image_url" ~* '[.](png|jpe?g|webp)$'
ORDER BY "id";

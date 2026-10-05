-- SAMONA Customer: profile avatar photos.
--
-- Creates the Supabase Storage bucket that holds customer profile avatars.
-- Storage belongs to Supabase, but its catalog is plain SQL in this same
-- database, so provisioning the bucket here keeps every environment
-- reproducible from migrations alone (same pattern as 'pro-selfies' and
-- 'job-images').

-- One public-read bucket. Paths are deterministic and scoped under the
-- customer's own id (customers/{userId}/avatar.jpg), so a retake overwrites
-- the previous photo through the same signed upload URL rather than leaving
-- orphaned objects behind.
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'avatars',
    'avatars',
    true,
    5242880, -- 5 MiB; a square profile photo, same guard as the face selfie.
    ARRAY['image/jpeg', 'image/png']::TEXT[]
)
ON CONFLICT ("id") DO UPDATE
SET "public" = EXCLUDED."public",
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types";
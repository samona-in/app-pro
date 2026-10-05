-- SAMONA Customer: job reference photos.
--
-- Creates the Supabase Storage bucket that holds photos customers attach to a
-- job request. Storage belongs to Supabase, but its catalog is plain SQL in
-- this same database, so provisioning the bucket here keeps every environment
-- reproducible from migrations alone (same pattern as 'pro-selfies').

-- One public-read bucket. Paths are server-minted UUID URLs scoped under the
-- customer's own id (jobs/{customerUserId}/{uuid}.jpg), so they are
-- unguessable; reads are URLs only, writes go through short-lived signed
-- upload URLs minted by the API and verified to have landed before a job is
-- recorded.
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'job-images',
    'job-images',
    true,
    10485760, -- 10 MiB; reference photos, larger than the face selfie guard.
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::TEXT[]
)
ON CONFLICT ("id") DO UPDATE
SET "public" = EXCLUDED."public",
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types";
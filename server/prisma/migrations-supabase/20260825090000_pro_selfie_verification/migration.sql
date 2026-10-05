-- SAMONA Pro: face verification selfie.
--
-- Adds the live-captured face photo to the Pro profile and creates the Supabase
-- Storage bucket it lives in. Storage belongs to Supabase, but its catalog is
-- plain SQL in this same database, so provisioning the bucket here keeps every
-- environment reproducible from migrations alone.

ALTER TABLE "pro_profiles" ADD COLUMN "selfie_photo_path" TEXT;
ALTER TABLE "pro_profiles" ADD COLUMN "selfie_captured_at" TIMESTAMP(3);

-- One public-read bucket. Paths contain the account's UUID, so they are
-- unguessable; reads are URLs only, writes go through short-lived signed
-- upload URLs minted by the API.
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'pro-selfies',
    'pro-selfies',
    true,
    5242880, -- 5 MiB, matching the API's upload guard.
    ARRAY['image/jpeg']::TEXT[]
)
ON CONFLICT ("id") DO UPDATE
SET "public" = EXCLUDED."public",
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types";

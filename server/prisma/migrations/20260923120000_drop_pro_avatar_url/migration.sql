-- Drop the pro profile photo.
--
-- Pros never recorded an avatar: the surface-avatars backfill moved every
-- stored photo to the customer surface, leaving pro_profiles.avatar_url NULL.
-- The pro's single photo is now the live-captured face selfie, so the column
-- (and its column-level grant) goes away.

ALTER TABLE "pro_profiles" DROP COLUMN "avatar_url";
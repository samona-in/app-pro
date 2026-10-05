-- Surface avatars.
--
-- A single `profiles` row is one person who can be both a customer and a
-- professional (Rapido style). The avatar used to be a single shared column on
-- the identity row, which forced both apps to show the same photo. Each surface
-- now carries its own profile photo on its own profile row, so one account can
-- present a different image as a customer than as a professional.

-- 1. Each surface profile owns an avatar.
ALTER TABLE "pro_profiles" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "customer_profiles" ADD COLUMN "avatar_url" TEXT;

-- 2. Backfill. Every avatar ever recorded was a *customer* avatar (the storage
--    paths live under customers/{userId}/), so it belongs on the customer
--    profile before the shared column goes away. Pros never had an avatar.
UPDATE "customer_profiles" cp
SET "avatar_url" = p."avatarUrl"
FROM "profiles" p
WHERE p."id" = cp."user_id"
  AND p."avatarUrl" IS NOT NULL;

-- 3. Drop the shared column; the surfaces are now the only owners.
ALTER TABLE "profiles" DROP COLUMN "avatarUrl";

-- 4. Column-level grants follow the data: the avatar is now writable on the
--    pro profile, and the identity row only keeps `fullName`.
GRANT UPDATE ("avatar_url") ON "pro_profiles" TO authenticated;
GRANT UPDATE ("fullName") ON "profiles" TO authenticated;
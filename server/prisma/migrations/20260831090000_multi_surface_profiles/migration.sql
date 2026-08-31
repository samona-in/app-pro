-- Multi-surface profiles.
--
-- A single phone number is now one account that can be both a customer and a
-- professional. The `role` enum column on `profiles` forced a person to be one
-- or the other; the surface is now chosen per-request by which app signs in
-- (the `X-App-Type` header) and each surface has its own profile row
-- (`pro_profiles` / `customer_profiles`). `is_admin` is the only stored
-- privilege, replacing the old single `role` value.

-- 1. Add `is_admin` and backfill it from any existing ADMIN role. Anyone who
--    was already an admin keeps admin access; everyone else is a plain user
--    who can operate on both surfaces.
ALTER TABLE "profiles"
  ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "profiles"
SET "is_admin" = true
WHERE "role" = 'ADMIN';

-- 2. Drop the old role column and its index; the surface is no longer stored.
DROP INDEX IF EXISTS "profiles_role_idx";
ALTER TABLE "profiles"
  DROP COLUMN "role";

-- 3. Index the remaining privilege/active flag that queries actually filter on.
CREATE INDEX "profiles_is_active_idx" ON "profiles"("is_active");

-- 4. The `UserRole` enum is no longer used by any column. Drop it once no
--    remaining value references it.
DROP TYPE IF EXISTS "UserRole";

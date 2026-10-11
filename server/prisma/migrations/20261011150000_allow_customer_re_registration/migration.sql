-- Allow a customer to re-register as a fresh customer after their customer
-- surface was deleted.
--
-- A CUSTOMER_PROFILE (or the customer half of FULL_ACCOUNT) deletion tombstones
-- the CustomerProfile row forever — jobs, reviews, chat and saved-address
-- history keep pointing at it — but an identity previously lost the ability to
-- ever be a customer again because the tombstone held `user_id` and
-- `ensureForUser` upserts by it. Now:
--
--  1. `user_id` becomes nullable and the tombstone's `user_id` is nulled, so
--     the unique key is free for a brand-new CustomerProfile under the same
--     identity. Anything that authorises by identity can no longer resolve the
--     old surface, so old bookings/conversations are never exposed to the new
--     profile.
--  2. `account_deletions.customer_profile_id` freezes *which* customer surface a
--     run deleted, so a retry of PURGE_DB targets the original row and can never
--     hit a profile the same identity re-registered in between.

-- The link must be widened first: the tombstone's `user_id` is still the only
-- handle we have to correlate past runs with the row they deleted.
ALTER TABLE "customer_profiles" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "account_deletions" ADD COLUMN "customer_profile_id" UUID;

-- Backfill the frozen target for every existing run that touched the customer
-- surface, from the tombstone that run created. Runs with no customer tombstone
-- (pure PRO_PROFILE) stay NULL.
UPDATE "account_deletions" d
SET "customer_profile_id" = cp."id"
FROM "customer_profiles" cp
WHERE cp."user_id" = d."profile_id"
  AND cp."deleted_at" IS NOT NULL
  AND d."scope"::text IN ('CUSTOMER_PROFILE', 'FULL_ACCOUNT');

-- Unlink every existing customer tombstone so the account can re-register.
-- Order matters: this must run after the backfill above.
UPDATE "customer_profiles"
SET "user_id" = NULL
WHERE "deleted_at" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "account_deletions_customer_profile_id_key" ON "account_deletions"("customer_profile_id");

-- AddForeignKey
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
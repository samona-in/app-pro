-- SAMONA Customer: free-text job category ("Other" skill).
--
-- The booking flow lets a customer pick "Other" instead of a predefined
-- category and type what they actually need. Mirrors the `placeDescription`
-- pattern used by `PlaceType.OTHER`:
--
--   * `jobs.custom_skill` holds the free text, null for predefined categories.
--   * Every service carries its own sentinel skill with slug `other`, so the
--     `skill_id` foreign key stays satisfied while the real category lives in
--     `custom_skill`. Earlier migrations deactivated the old placeholder
--     skills; this one adds the sentinel alongside the new catalogue.
--
-- Skill slugs already identify one category within one service and two
-- services legitimately share the `other` slug, so slugs are made unique per
-- (service, slug) instead of globally.
--
-- Re-running this migration is harmless: the column add is guarded, the index
-- swap is idempotent (the name is deterministic and `IF NOT EXISTS`) and the
-- upsert only touches activation.

-- Skill slugs are only meaningful within their service.
DROP INDEX IF EXISTS "skills_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "skills_service_id_slug_key" ON "skills" ("service_id", "slug");

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "custom_skill" TEXT;

INSERT INTO "skills" ("id", "service_id", "slug", "name", "sort_order", "is_active")
SELECT gen_random_uuid(), s."id", 'other', 'Other', 999, true
FROM "services" s
WHERE s."is_active" = true
ON CONFLICT ("service_id", "slug") DO UPDATE SET "is_active" = true;
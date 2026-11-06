-- Configurable pricing models for the catalogue and booking snapshots.
--
-- `skills.base_price_paise` is reused as the price for every model: per unit,
-- per booking, or per hour. No second price column is introduced.
--
-- Existing skills default to PER_BOOKING (their current behaviour: one fixed
-- price for one visit). Existing bookings are backfilled as a single-unit
-- PER_BOOKING snapshot so their totals never change.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "PricingModel" AS ENUM ('PER_UNIT', 'PER_BOOKING', 'PER_HOUR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: catalogue pricing configuration
-- IF NOT EXISTS keeps this migration safe to re-run after a partial failure.
ALTER TABLE "skills"
  ADD COLUMN IF NOT EXISTS "pricing_model" "PricingModel" NOT NULL DEFAULT 'PER_BOOKING',
  ADD COLUMN IF NOT EXISTS "unit_label" TEXT,
  ADD COLUMN IF NOT EXISTS "min_quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "max_quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "min_duration_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_duration_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "duration_step_minutes" INTEGER;

-- AlterTable: booking pricing snapshot
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "pricing_model" "PricingModel" NOT NULL DEFAULT 'PER_BOOKING',
  ADD COLUMN IF NOT EXISTS "unit_price_paise" INTEGER,
  ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "unit_label" TEXT,
  ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER;

-- Existing bookings: the stored base pay was already the full fixed amount.
UPDATE "jobs"
SET "unit_price_paise" = "base_pay_paise"
WHERE "unit_price_paise" IS NULL;

ALTER TABLE "jobs" ALTER COLUMN "unit_price_paise" SET NOT NULL;

-- Backfill countable works as PER_UNIT. Everything not listed here stays
-- PER_BOOKING: personal help, moving/labour, cleaning, painting, "Other", etc.

-- Unit: fan
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'fan', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" IN ('fan-installation', 'fan-repair');

-- Unit: light
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'light', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" IN (
  'light-fixture-installation',
  'light-fixture-repair',
  'outdoor-lighting-installation'
);

-- Unit: switch / socket
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'switch', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" IN (
  'electrical-socket-switch-installation',
  'electrical-socket-switch-relocation',
  'electrical-socket-switch-repair'
);

-- Unit: tap
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'tap', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" IN ('tap-repair', 'tap-installation');

-- Unit: toilet / shower / heater / tank
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'toilet', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" IN ('toilet-installation', 'toilet-repair');

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'shower', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" IN ('shower-repair', 'shower-installation');

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'heater', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" = 'water-heater-installation';

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'tank', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" IN ('water-tank-repair', 'water-tank-installation');

-- Unit: door / window / furniture / modular fitting
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'window/door', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" = 'door-window';

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'item', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" = 'furniture-repair';

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'fitting', "min_quantity" = 1, "max_quantity" = 20
WHERE "slug" = 'modular-fitting';

-- Unit: tyre / battery
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'tyre', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" = 'tyre-service';

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'battery', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" = 'battery-service';

-- Unit: device / appliance / AC
UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'device', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" IN ('laptop-repair', 'desktop-repair', 'screen-replacement');

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'appliance', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" IN ('washing-machine', 'refrigerator');

UPDATE "skills"
SET "pricing_model" = 'PER_UNIT', "unit_label" = 'unit', "min_quantity" = 1, "max_quantity" = 10
WHERE "slug" IN ('ac-repair', 'ac-installation', 'ac-gas-charging', 'ac-pcb-repair', 'ac-maintenance');

-- A concrete example from the product brief: ₹199 per hinge, up to 20 hinges.
-- Added under Carpentry → Doors & Windows. The service id is resolved by slug
-- rather than hard-coded: deployments that predate the baseline migration use
-- the legacy `carpeting` slug for the same trade. If neither service exists the
-- insert is a no-op, so this migration never fails on an unrelated catalogue.
-- The work-group seed assigns the group id when it next runs; until then the
-- customer app lists it under the service's "Additional work" bucket.
INSERT INTO "skills" (
  "id",
  "service_id",
  "slug",
  "name",
  "sort_order",
  "is_active",
  "base_price_paise",
  "pricing_model",
  "unit_label",
  "min_quantity",
  "max_quantity"
)
SELECT
  gen_random_uuid(),
  sv."id",
  'window-hinge-repair',
  'Window hinge repair',
  4,
  true,
  19900,
  'PER_UNIT',
  'hinge',
  1,
  20
FROM "services" AS sv
WHERE sv."slug" IN ('carpentry', 'carpeting')
ORDER BY CASE sv."slug" WHEN 'carpentry' THEN 0 ELSE 1 END
LIMIT 1
ON CONFLICT ("service_id", "slug") DO NOTHING;

-- Attach it to the seeded Doors & Windows group when that group exists.
UPDATE "skills" AS s
SET "group_id" = g."id"
FROM "service_work_groups" AS g
WHERE g."service_id" = s."service_id"
  AND g."slug" = 'doors-and-windows'
  AND s."slug" = 'window-hinge-repair';

-- Multi-work (bulk) orders: one job request carrying several distinct works of
-- the same service.
--
-- `jobs` keeps its flat pricing snapshot (the first item's) and gains
-- `order_type`; every *new* job also writes per-work rows into `job_items`.
-- Legacy jobs stay exactly as they are — their works are derived from the
-- flat columns on read, so no item rows are invented for them.
--
-- `jobs.base_pay_paise` stays the authoritative whole-booking total: for a new
-- BULK job it is the sum of the item subtotals, so every accept/pay/earnings
-- path keeps reading one number.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "OrderType" AS ENUM ('SINGLE', 'BULK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "order_type" "OrderType" NOT NULL DEFAULT 'SINGLE';

-- CreateTable
CREATE TABLE IF NOT EXISTS "job_items" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "skill_id" UUID NOT NULL,
    "custom_skill" TEXT,
    "pricing_model" "PricingModel" NOT NULL DEFAULT 'PER_BOOKING',
    "unit_price_paise" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_label" TEXT,
    "duration_minutes" INTEGER,
    "subtotal_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "job_items_job_id_idx" ON "job_items"("job_id");

-- AddForeignKey
-- IF NOT EXISTS keeps this migration safe to re-run after a partial failure.
DO $$
BEGIN
  ALTER TABLE "job_items"
    ADD CONSTRAINT "job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "job_items"
    ADD CONSTRAINT "job_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A work row always books at least one unit; the column default of 1 only
-- applies to the raw table, this guard is what the server writes against.
DO $$
BEGIN
  ALTER TABLE "job_items"
    ADD CONSTRAINT "job_items_quantity_positive" CHECK ("quantity" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

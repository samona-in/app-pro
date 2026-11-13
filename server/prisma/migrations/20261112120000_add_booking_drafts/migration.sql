-- Saved booking carts ("drafts").
--
-- A draft is the request a customer is still building: one service, one or more
-- distinct works, notes and reference photos. Persisting it server-side means
-- the cart survives an app kill or a device switch, and gives support and
-- analytics a durable record of what customers were assembling when they
-- dropped off.
--
-- A customer has at most one ACTIVE draft. Converted and abandoned rows are
-- kept as history; converted rows point at the booking they became.
--
-- Prices on a draft are an estimate refreshed on every save. Placing the
-- booking re-prices everything and freezes the result on the job, so nothing
-- here is ever treated as a commitment.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "BookingDraftStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "booking_drafts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "BookingDraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL DEFAULT '',
    "image_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_total_paise" INTEGER NOT NULL DEFAULT 0,
    "converted_job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "booking_draft_items" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
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

    CONSTRAINT "booking_draft_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "booking_drafts_converted_job_id_key" ON "booking_drafts"("converted_job_id");

-- One ACTIVE cart per customer. Partial so the history rows (CONVERTED,
-- ABANDONED) can accumulate without tripping the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "booking_drafts_one_active_per_customer_idx"
  ON "booking_drafts"("customer_id")
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "booking_drafts_customer_id_status_idx" ON "booking_drafts"("customer_id", "status");
CREATE INDEX IF NOT EXISTS "booking_drafts_service_id_status_idx" ON "booking_drafts"("service_id", "status");
CREATE INDEX IF NOT EXISTS "booking_drafts_status_updated_at_idx" ON "booking_drafts"("status", "updated_at");
CREATE INDEX IF NOT EXISTS "booking_draft_items_draft_id_idx" ON "booking_draft_items"("draft_id");

-- AddForeignKey (guarded so a partially-applied migration can be re-run)
DO $$
BEGIN
  ALTER TABLE "booking_drafts"
    ADD CONSTRAINT "booking_drafts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "booking_drafts"
    ADD CONSTRAINT "booking_drafts_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "booking_drafts"
    ADD CONSTRAINT "booking_drafts_converted_job_id_fkey" FOREIGN KEY ("converted_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "booking_draft_items"
    ADD CONSTRAINT "booking_draft_items_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "booking_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "booking_draft_items"
    ADD CONSTRAINT "booking_draft_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

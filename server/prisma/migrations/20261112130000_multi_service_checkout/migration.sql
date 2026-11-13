-- Multi-service checkouts.
--
-- One checkout may carry works from several services. Each service becomes its
-- own job (own pro, lifecycle, OTP, chat, cash payment), so the jobs are linked
-- only by a shared `order_group_id` — there is deliberately no parent order
-- with a lifecycle of its own.
--
-- The saved cart follows the same shape: one ACTIVE draft row per
-- (customer, service) instead of one per customer. Notes and photos are copied
-- onto each row because they are shared by the visit.

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "order_group_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jobs_order_group_id_idx" ON "jobs"("order_group_id");

-- One ACTIVE cart per (customer, service). Replaces the previous
-- one-per-customer constraint: a multi-service cart needs one row per service.
DROP INDEX IF EXISTS "booking_drafts_one_active_per_customer_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "booking_drafts_one_active_per_service_idx"
  ON "booking_drafts"("customer_id", "service_id")
  WHERE "status" = 'ACTIVE';

-- SAMONA order-service lifecycle (architecture §21–§27).
--
-- A customer files a service_request; dispatch is modelled as job_offers (one
-- per pro, instant dispatch) and supply gaps as pro_interests (available jobs).
-- The customer selects a pro atomically and the same request row becomes the
-- confirmed job through TRAVELLING → ARRIVED → IN_PROGRESS → COMPLETED → PAID.
-- Every status change lands in job_status_history.

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('REQUESTED', 'DISPATCHING', 'CHOOSING_PRO', 'OPEN', 'CONFIRMED', 'TRAVELLING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'SELECTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProInterestStatus" AS ENUM ('INTERESTED', 'SELECTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "description" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "selected_pro_id" UUID,
    "estimated_price" INTEGER,
    "final_price" INTEGER,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "status" "JobOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "distance_km" DOUBLE PRECISION NOT NULL,
    "estimated_eta_minutes" INTEGER NOT NULL,
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_interests" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "status" "ProInterestStatus" NOT NULL DEFAULT 'INTERESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_history" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_customer_id_status_idx" ON "service_requests"("customer_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_service_id_idx" ON "service_requests"("service_id");

-- CreateIndex
CREATE INDEX "service_requests_status_expires_at_idx" ON "service_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "service_requests_selected_pro_id_status_idx" ON "service_requests"("selected_pro_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_offers_service_request_id_pro_id_key" ON "job_offers"("service_request_id", "pro_id");

-- CreateIndex
CREATE INDEX "job_offers_pro_id_status_expires_at_idx" ON "job_offers"("pro_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "job_offers_service_request_id_status_idx" ON "job_offers"("service_request_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pro_interests_service_request_id_pro_id_key" ON "pro_interests"("service_request_id", "pro_id");

-- CreateIndex
CREATE INDEX "pro_interests_pro_id_status_idx" ON "pro_interests"("pro_id", "status");

-- CreateIndex
CREATE INDEX "pro_interests_service_request_id_status_idx" ON "pro_interests"("service_request_id", "status");

-- CreateIndex
CREATE INDEX "job_status_history_service_request_id_created_at_idx" ON "job_status_history"("service_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_service_request_id_key" ON "payments"("service_request_id");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_selected_pro_id_fkey" FOREIGN KEY ("selected_pro_id") REFERENCES "pro_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_interests" ADD CONSTRAINT "pro_interests_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_interests" ADD CONSTRAINT "pro_interests_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row level security (defence in depth; the API connects with the privileged
-- role and is the real enforcement point).
-- ---------------------------------------------------------------------------
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pro_interests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;

-- A customer touches only their own requests.
CREATE POLICY "service_requests_own_customer" ON "service_requests"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "customer_id")
  WITH CHECK ((SELECT auth.uid()) = "customer_id");

-- A pro sees requests they were offered, interested in, or selected for.
-- SELECT only: dispatch is performed by the backend, never by a pro.
CREATE POLICY "service_requests_pro_view" ON "service_requests"
  FOR SELECT TO authenticated
  USING (
    "selected_pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM "job_offers" o WHERE o."service_request_id" = "id" AND o."pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM "pro_interests" i WHERE i."service_request_id" = "id" AND i."pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid()))
    )
  );

-- An open request is visible to any eligible pro browsing Available Jobs. The
-- API filters to eligible pros and hides customer identity until confirmation.
CREATE POLICY "service_requests_open_read" ON "service_requests"
  FOR SELECT TO authenticated
  USING ("status" IN ('OPEN', 'CHOOSING_PRO'));

-- Offers: pro reads own, backend writes.
CREATE POLICY "job_offers_pro_own" ON "job_offers"
  FOR SELECT TO authenticated
  USING ("pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid())));

-- Interests: pro writes/reads own; backend resolves selection atomically.
CREATE POLICY "pro_interests_pro_own" ON "pro_interests"
  FOR ALL TO authenticated
  USING ("pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid())))
  WITH CHECK ("pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid())));

-- Status history and payments are audit data read by the parties involved.
CREATE POLICY "job_status_history_read" ON "job_status_history"
  FOR SELECT TO authenticated
  USING (
    "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "customer_id" = (SELECT auth.uid())
      OR "selected_pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid())))
  );

CREATE POLICY "payments_read_related" ON "payments"
  FOR SELECT TO authenticated
  USING (
    "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "customer_id" = (SELECT auth.uid())
      OR "selected_pro_id" IN (SELECT "id" FROM "pro_profiles" WHERE "user_id" = (SELECT auth.uid())))
  );
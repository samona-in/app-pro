-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('REQUESTED', 'OFFERED', 'ACCEPTED', 'TRAVELLING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('RESIDENCE', 'OFFICE', 'OTHER');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "pro_id" UUID,
    "service_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'REQUESTED',
    "place_type" "PlaceType" NOT NULL,
    "place_description" TEXT,
    "description" TEXT NOT NULL,
    "image_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "base_pay_paise" INTEGER NOT NULL,
    "agreed_pay_paise" INTEGER,
    "final_pay_paise" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "from_status" "JobStatus",
    "to_status" "JobStatus" NOT NULL,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_customer_id_status_idx" ON "jobs"("customer_id", "status");

-- CreateIndex
CREATE INDEX "jobs_service_id_status_idx" ON "jobs"("service_id", "status");

-- CreateIndex
CREATE INDEX "jobs_pro_id_status_idx" ON "jobs"("pro_id", "status");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE INDEX "job_status_history_job_id_idx" ON "job_status_history"("job_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row level security (defence in depth)
-- ---------------------------------------------------------------------------
--
-- The Express API is the enforcement point and connects as a role that bypasses
-- RLS. These policies exist so that if the mobile client's publishable key ever
-- queries Supabase directly, a caller can still only reach their own rows.
-- They are NOT evidence of authorised writes: the API is the single writer,
-- and no customer-controlled status/UPSERT policy is granted here.

ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_status_history" ENABLE ROW LEVEL SECURITY;

-- A customer can read only the jobs they placed (and, once matched, the
-- professional who accepted them). Professionals' own read access lands with
-- the Pro job-matching feature; it is deliberately not opened here.
CREATE POLICY "jobs_select_own" ON "jobs"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "customer_profiles" c
      WHERE c."id" = "jobs"."customer_id" AND c."user_id" = (SELECT auth.uid())
    )
  );

-- A customer may insert their own request. Status and amounts are not in the
-- allow-list below, so a direct call cannot fabricate an accepted/paid job.
CREATE POLICY "jobs_insert_own" ON "jobs"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "customer_profiles" c
      WHERE c."id" = "jobs"."customer_id" AND c."user_id" = (SELECT auth.uid())
    )
  ) AND "status" = 'REQUESTED' AND "base_pay_paise" >= 0;

CREATE POLICY "job_status_history_read_own" ON "job_status_history"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "jobs" j
      JOIN "customer_profiles" c ON c."id" = j."customer_id"
      WHERE j."id" = "job_status_history"."job_id" AND c."user_id" = (SELECT auth.uid())
    )
  );
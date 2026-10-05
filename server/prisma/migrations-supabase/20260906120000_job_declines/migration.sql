-- Job declines: a pro can explicitly turn down an open request so it is not
-- re-paged to them. One row per pro per job; the decline never touches the
-- job's own status or the customer, and a pro can decline the same job only
-- once (the unique index also makes a racing double-decline harmless).

-- CreateTable
CREATE TABLE "job_declines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_declines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_declines_job_id_pro_id_key" ON "job_declines"("job_id", "pro_id");

-- CreateIndex
CREATE INDEX "job_declines_pro_id_idx" ON "job_declines"("pro_id");

-- AddForeignKey
ALTER TABLE "job_declines" ADD CONSTRAINT "job_declines_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_declines" ADD CONSTRAINT "job_declines_pro_id_fkey"
  FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row level security (defence in depth)
-- ---------------------------------------------------------------------------
--
-- The Express API is the single writer; these policies exist so a caller with
-- the mobile publishable key can still only reach their own declines. Insert
-- is additionally capped at our own pro row and to requests that are genuinely
-- still open (REQUESTED, unassigned) — a direct call cannot decline a job that
-- is no longer waiting.

ALTER TABLE "job_declines" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_declines_read_own" ON "job_declines"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "pro_profiles" p
      WHERE p."id" = "job_declines"."pro_id" AND p."user_id" = (SELECT auth.uid())
    )
  );

CREATE POLICY "job_declines_insert_own" ON "job_declines"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "pro_profiles" p
      WHERE p."id" = "job_declines"."pro_id" AND p."user_id" = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM "jobs" j
      WHERE j."id" = "job_declines"."job_id" AND j."status" = 'REQUESTED' AND j."pro_id" IS NULL
    )
  );
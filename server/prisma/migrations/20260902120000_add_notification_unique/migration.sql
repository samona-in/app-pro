-- Add the missing unique constraint that Prisma schema declares via
-- @@unique([proId, jobId, kind]) but was never created in the original
-- notifications table migration.
--
-- This fixes: "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" when calling prisma.notification.upsert().

CREATE UNIQUE INDEX "notifications_pro_id_job_id_kind_key"
  ON "notifications" ("pro_id", "job_id", "kind");

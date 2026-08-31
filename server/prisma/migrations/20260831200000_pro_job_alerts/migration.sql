-- Pro job alerts via push notifications.
--
-- Add push delivery to the professional profile and persist each delivered
-- push so the Notifications screen can list history and a repeating job alert
-- can track what was already paged.

-- 1. Add two columns to `pro_profiles`: the Expo device push token and whether
--    the Pro wants job alerts at all. The token is unique so the same device
--    cannot register twice against different profiles.
ALTER TABLE "pro_profiles"
  ADD COLUMN "push_token" TEXT,
  ADD COLUMN "job_alerts_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "pro_profiles_push_token_key" ON "pro_profiles"("push_token");

-- 2. The delivered-notification history, one row per push.
CREATE TYPE "NotificationKind" AS ENUM ('JOB_ALERT', 'JOB_STATUS', 'PAYMENT', 'SYSTEM');

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pro_id" UUID NOT NULL,
    "job_id" UUID,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "provider_ref" TEXT,
    "repeats" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_pro_id_created_at_idx" ON "notifications"("pro_id", "created_at");
CREATE INDEX "notifications_job_id_idx" ON "notifications"("job_id");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row level security (defence in depth)
-- ---------------------------------------------------------------------------
-- The Express API is the enforcement point, writing notifications on behalf of
-- pros. RLS is belt-and-braces: if the mobile client's publishable key ever
-- queries Supabase directly, a Pro can read only their own notification rows
-- and can never write them (delivery is the server's job).

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON "notifications"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "pro_profiles" p
      WHERE p."id" = "notifications"."pro_id" AND p."user_id" = (SELECT auth.uid())
    )
  );

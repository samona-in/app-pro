-- Customer-facing notifications.
--
-- The pro `notifications` table records *pushes* (delivery state, repeats,
-- resolution). Customers get a separate, simpler notice table: the jobs domain
-- writes a row when it publishes a status/payment event, and the Customer
-- app's Notifications screen lists it with a per-row read state. No push
-- machinery — customer job-event pushes are a separate concern.

CREATE TABLE "customer_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "job_id" UUID,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_notifications_customer_id_created_at_idx" ON "customer_notifications"("customer_id", "created_at");
CREATE INDEX "customer_notifications_job_id_idx" ON "customer_notifications"("job_id");

ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row level security (defence in depth)
-- ---------------------------------------------------------------------------
-- The Express API is the enforcement point, writing notices on behalf of
-- customers. RLS is belt-and-braces: if the mobile client's publishable key
-- ever queries Supabase directly, a customer can read only their own
-- notification rows and can never write them (recording and marking-read are
-- the API's job).

ALTER TABLE "customer_notifications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_notifications_select_own" ON "customer_notifications"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "customer_profiles" c
      WHERE c."id" = "customer_notifications"."customer_id" AND c."user_id" = (SELECT auth.uid())
    )
  );
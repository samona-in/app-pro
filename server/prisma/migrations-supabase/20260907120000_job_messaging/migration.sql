-- Job messaging: a chat between the two parties of an accepted job.
--
-- A message is anchored to the `Job` and the `Profile` that sent it, so no
-- separate conversation table is needed. The customer push-token columns mirror
-- the pro ones so the same provider-aware delivery path can reach a customer.

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_job_id_sent_at_idx" ON "messages"("job_id", "sent_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: a customer's device push token, mirroring the pro columns.
ALTER TABLE "customer_profiles" ADD COLUMN "push_token" TEXT;
ALTER TABLE "customer_profiles" ADD COLUMN "push_platform" "PushPlatform";
ALTER TABLE "customer_profiles" ADD COLUMN "push_provider" "PushProvider";

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_push_token_key" ON "customer_profiles"("push_token");

-- ---------------------------------------------------------------------------
-- Row level security (defence in depth)
-- ---------------------------------------------------------------------------
--
-- The Express API is the single writer; these policies exist so a caller with
-- the mobile publishable key can still only reach messages from jobs they are
-- a party to (customer via their customer profile, pro via their pro profile).
-- Insert is capped to the caller's own identity.

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_read_party" ON "messages"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "jobs" j
      WHERE j."id" = "messages"."job_id"
        AND (
          j."customer_id" = (
            SELECT cp."id" FROM "customer_profiles" cp WHERE cp."user_id" = (SELECT auth.uid())
          )
          OR j."pro_id" = (
            SELECT pp."id" FROM "pro_profiles" pp WHERE pp."user_id" = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY "messages_insert_own" ON "messages"
  FOR INSERT TO authenticated
  WITH CHECK (
    "sender_id" = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM "jobs" j
      WHERE j."id" = "messages"."job_id"
        AND (
          j."customer_id" = (
            SELECT cp."id" FROM "customer_profiles" cp WHERE cp."user_id" = (SELECT auth.uid())
          )
          OR j."pro_id" = (
            SELECT pp."id" FROM "pro_profiles" pp WHERE pp."user_id" = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY "messages_update_own" ON "messages"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "jobs" j
    WHERE j."id" = "messages"."job_id"
      AND (
        j."customer_id" = (
          SELECT cp."id" FROM "customer_profiles" cp WHERE cp."user_id" = (SELECT auth.uid())
        )
        OR j."pro_id" = (
          SELECT pp."id" FROM "pro_profiles" pp WHERE pp."user_id" = (SELECT auth.uid())
        )
      )
  ))
  WITH CHECK (
    "sender_id" = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM "jobs" j
      WHERE j."id" = "messages"."job_id"
        AND (
          j."customer_id" = (
            SELECT cp."id" FROM "customer_profiles" cp WHERE cp."user_id" = (SELECT auth.uid())
          )
          OR j."pro_id" = (
            SELECT pp."id" FROM "pro_profiles" pp WHERE pp."user_id" = (SELECT auth.uid())
          )
        )
    )
  );
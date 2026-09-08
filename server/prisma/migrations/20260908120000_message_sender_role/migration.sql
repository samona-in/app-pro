-- Chat messages need to know which side of the job authored them.
--
-- A person can be both the customer and the pro of the same job (one phone
-- number on two apps / devices): `messages.sender_id` then equals both the
-- job's customer and pro, so the role cannot be derived from the id. Storing
-- `sender_role` keeps "mine" vs "theirs" unambiguous for every surface.

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('CUSTOMER', 'PRO');

-- Add the column (nullable to backfill first).
ALTER TABLE "messages" ADD COLUMN "sender_role" "SenderRole";

-- Backfill: a message came from the customer side when its sender's profile is
-- the one behind the job's customer profile, the pro side otherwise.
UPDATE "messages" m
SET "sender_role" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "customer_profiles" cp
    JOIN "jobs" j ON j."customer_id" = cp."id"
    WHERE j."id" = m."job_id" AND cp."user_id" = m."sender_id"
  ) THEN 'CUSTOMER'::"SenderRole"
  ELSE 'PRO'::"SenderRole"
END;

-- Sender role is a property of every message, present from now on.
ALTER TABLE "messages" ALTER COLUMN "sender_role" SET NOT NULL;
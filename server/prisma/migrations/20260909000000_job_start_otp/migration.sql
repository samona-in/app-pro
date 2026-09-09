-- Start-work OTP verification.
--
-- When a pro swipes "Start Work", the server generates a single 4-digit code,
-- pushes it to the customer and records it here. The pro must then enter the
-- code the customer reads back before the job may leave ARRIVED. One job gets
-- one code (guarded by `otp_issued_at`); failed attempts are counted so a wrong
-- code cannot be sprayed.

ALTER TABLE "jobs"
    ADD COLUMN "verification_otp" TEXT,
    ADD COLUMN "otp_issued_at" TIMESTAMP(3),
    ADD COLUMN "start_otp_attempts" INTEGER NOT NULL DEFAULT 0;

-- Phone-OTP delivery telemetry.
--
-- Supabase Auth owns the OTP lifecycle and does not tell the client which
-- Twilio Verify verification/attempt it created. To diagnose delivery failures
-- we record two PII-free things:
--
--   * otp_attempts         — one row per code request from the app, keyed by an
--                            HMAC-SHA256 hash of the E.164 number plus the last
--                            two digits. The raw number is never stored.
--   * otp_delivery_events  — one row per Twilio Message Status Stream callback,
--                            carrying carrier MCC/MNC and the Twilio SIDs so a
--                            carrier or handset failure can be distinguished.
--
-- Events are correlated to an attempt by phone hash + request time, because
-- Supabase does not expose the Verification SID to the client. See
-- docs/otp-delivery-audit.md.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "OtpApp" AS ENUM ('CUSTOMER', 'PRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "OtpDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'UNDELIVERED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "otp_attempts" (
    "id" UUID NOT NULL,
    "client_attempt_id" VARCHAR(64) NOT NULL,
    "phone_hash" VARCHAR(64) NOT NULL,
    "phone_last2" VARCHAR(2) NOT NULL,
    "app" "OtpApp" NOT NULL,
    "device_manufacturer" VARCHAR(64),
    "device_model" VARCHAR(64),
    "os_version" VARCHAR(32),
    "verification_sid" VARCHAR(34),
    "attempt_sid" VARCHAR(34),
    "status" "OtpDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otp_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "otp_delivery_events" (
    "id" UUID NOT NULL,
    "event_id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(96) NOT NULL,
    "verification_sid" VARCHAR(34),
    "attempt_sid" VARCHAR(34),
    "phone_hash" VARCHAR(64) NOT NULL,
    "phone_last2" VARCHAR(2),
    "channel" VARCHAR(16),
    "status" "OtpDeliveryStatus" NOT NULL,
    "mcc" VARCHAR(4),
    "mnc" VARCHAR(4),
    "number_segments" INTEGER,
    "event_time" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "otp_attempt_id" UUID,

    CONSTRAINT "otp_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "otp_attempts_client_attempt_id_key"
  ON "otp_attempts"("client_attempt_id");
CREATE INDEX IF NOT EXISTS "otp_attempts_phone_hash_requested_at_idx"
  ON "otp_attempts"("phone_hash", "requested_at");
CREATE INDEX IF NOT EXISTS "otp_attempts_verification_sid_idx"
  ON "otp_attempts"("verification_sid");
CREATE INDEX IF NOT EXISTS "otp_attempts_requested_at_idx"
  ON "otp_attempts"("requested_at");

CREATE UNIQUE INDEX IF NOT EXISTS "otp_delivery_events_event_id_key"
  ON "otp_delivery_events"("event_id");
CREATE INDEX IF NOT EXISTS "otp_delivery_events_verification_sid_idx"
  ON "otp_delivery_events"("verification_sid");
CREATE INDEX IF NOT EXISTS "otp_delivery_events_phone_hash_event_time_idx"
  ON "otp_delivery_events"("phone_hash", "event_time");
CREATE INDEX IF NOT EXISTS "otp_delivery_events_status_event_time_idx"
  ON "otp_delivery_events"("status", "event_time");
CREATE INDEX IF NOT EXISTS "otp_delivery_events_otp_attempt_id_idx"
  ON "otp_delivery_events"("otp_attempt_id");

-- AddForeignKey (guarded so a partially-applied migration can be re-run)
DO $$
BEGIN
  ALTER TABLE "otp_delivery_events"
    ADD CONSTRAINT "otp_delivery_events_otp_attempt_id_fkey"
    FOREIGN KEY ("otp_attempt_id") REFERENCES "otp_attempts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

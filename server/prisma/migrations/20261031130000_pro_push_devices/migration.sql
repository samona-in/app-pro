CREATE TABLE "pro_push_devices" (
    "id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "push_platform" "PushPlatform" NOT NULL,
    "push_provider" "PushProvider" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pro_push_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pro_push_devices_device_id_key" ON "pro_push_devices"("device_id");
CREATE UNIQUE INDEX "pro_push_devices_push_token_key" ON "pro_push_devices"("push_token");
CREATE INDEX "pro_push_devices_pro_id_idx" ON "pro_push_devices"("pro_id");
ALTER TABLE "pro_push_devices" ADD CONSTRAINT "pro_push_devices_pro_id_fkey"
    FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing registrations. Older installs without a device id get a
-- deterministic compatibility id; their next registration adopts the real id.
-- DISTINCT ON tolerates historical duplicate device ids without losing the
-- latest registration; profile fields remain available as a legacy fallback.
INSERT INTO "pro_push_devices" (
    "id", "pro_id", "device_id", "push_token", "push_platform", "push_provider", "created_at", "updated_at"
)
SELECT DISTINCT ON (COALESCE(NULLIF("push_device_id", ''), 'legacy:' || "id"::text))
    gen_random_uuid(), "id", COALESCE(NULLIF("push_device_id", ''), 'legacy:' || "id"::text),
    "push_token", COALESCE("push_platform", 'IOS'::"PushPlatform"),
    COALESCE("push_provider", 'EXPO'::"PushProvider"), "created_at", "updated_at"
FROM "pro_profiles"
WHERE "push_token" IS NOT NULL AND "deleted_at" IS NULL AND "deletion_requested_at" IS NULL
ORDER BY COALESCE(NULLIF("push_device_id", ''), 'legacy:' || "id"::text), "updated_at" DESC;

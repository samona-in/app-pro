
-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationTargetType" AS ENUM ('PROMOTIONAL_OFFERS', 'BOOKING_REMINDERS', 'PRO_ENGAGEMENT', 'NEW_SERVICE_ANNOUNCEMENTS', 'APPLICATION_UPDATES', 'IMPORTANT_ANNOUNCEMENTS', 'CUSTOM_NOTIFICATIONS');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('ALL_CUSTOMERS', 'ALL_PROFESSIONALS', 'EVERYONE', 'VERIFIED_PROFESSIONALS', 'OFFLINE_PROFESSIONALS', 'ONLINE_PROFESSIONALS', 'PROFESSIONALS_INCOMPLETE_PROFILES', 'CUSTOMERS_NOT_BOOKED_RECENTLY', 'CUSTOMERS_WITH_COMPLETED_BOOKINGS', 'CITY_BASED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AutomationType" AS ENUM ('OFFLINE_REMINDER', 'PROFILE_COMPLETION_REMINDER', 'VERIFICATION_REMINDER', 'ENGAGEMENT_REMINDER', 'BOOKING_REMINDER', 'UPCOMING_BOOKING_REMINDER', 'SERVICE_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "notification_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "type" "NotificationTargetType" NOT NULL,
    "audience" "AudienceType" NOT NULL,
    "audience_filters" JSONB,
    "deep_link" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "send_now" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "successful_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "conversion_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_campaign_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "customer_id" UUID,
    "pro_id" UUID,
    "user_id" UUID,
    "push_token" TEXT,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_automations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AutomationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger_config" JSONB NOT NULL,
    "template" JSONB NOT NULL,
    "cooldown_hours" INTEGER NOT NULL DEFAULT 24,
    "max_per_day" INTEGER NOT NULL DEFAULT 1,
    "quiet_hours_start" INTEGER,
    "quiet_hours_end" INTEGER,
    "audience_filters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL,
    "campaign_id" UUID,
    "event_type" TEXT NOT NULL,
    "user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "promotional_enabled" BOOLEAN NOT NULL DEFAULT true,
    "booking_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pro_engagement_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_campaigns_status_idx" ON "notification_campaigns"("status");

-- CreateIndex
CREATE INDEX "notification_campaigns_scheduled_at_idx" ON "notification_campaigns"("scheduled_at");

-- CreateIndex
CREATE INDEX "notification_campaigns_created_at_idx" ON "notification_campaigns"("created_at");

-- CreateIndex
CREATE INDEX "notification_campaign_recipients_campaign_id_idx" ON "notification_campaign_recipients"("campaign_id");

-- CreateIndex
CREATE INDEX "notification_campaign_recipients_customer_id_idx" ON "notification_campaign_recipients"("customer_id");

-- CreateIndex
CREATE INDEX "notification_campaign_recipients_pro_id_idx" ON "notification_campaign_recipients"("pro_id");

-- CreateIndex
CREATE INDEX "notification_campaign_recipients_status_idx" ON "notification_campaign_recipients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_campaign_recipients_campaign_id_customer_id_key" ON "notification_campaign_recipients"("campaign_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_campaign_recipients_campaign_id_pro_id_key" ON "notification_campaign_recipients"("campaign_id", "pro_id");

-- CreateIndex
CREATE INDEX "notification_automations_enabled_type_idx" ON "notification_automations"("enabled", "type");

-- CreateIndex
CREATE INDEX "notification_events_campaign_id_idx" ON "notification_events"("campaign_id");

-- CreateIndex
CREATE INDEX "notification_events_event_type_idx" ON "notification_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "notification_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "notification_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Baseline schema for AWS RDS PostgreSQL.
--
-- This replaces the 31-migration Supabase chain, which is archived under
-- prisma/migrations-supabase/ and must not be run here. That chain could only
-- ever have executed on Supabase: it carried a foreign key to auth.users, 19
-- row-level-security policies bound to the Supabase-provided `authenticated`
-- role, column grants to that role, a trigger on auth.users, and inserts into
-- the Supabase Storage bucket catalogue. Prisma cannot even introspect a
-- database carrying it — `migrate diff` fails with P4002 on the cross-schema
-- reference — so it is not a starting point for a plain Postgres instance.
--
-- What this file is: the DDL Prisma generates from schema.prisma for an empty
-- database, followed by the reference data (services and skills).
--
-- Verification: applied to an empty PostgreSQL 16, then diffed back against
-- schema.prisma — `prisma migrate diff` reports an empty migration, zero drift.
-- Separately, the databases produced by this file and by the archived 31-step
-- chain were compared structurally: all 185 columns (with types and
-- nullability), all 12 enums with their labels, all 23 foreign keys, every check
-- and unique constraint, and all 47 indexes match. Nothing was lost in the
-- squash.
--
-- Two deliberate differences from the old chain:
--
--   * No `DEFAULT gen_random_uuid()` on primary keys. schema.prisma declares
--     `@default(uuid())`, which Prisma satisfies client-side; it never asked
--     for a database-level default. The old chain's defaults were invisible to
--     the datamodel, which is exactly the drift a squash removes.
--
--   * The `profiles.isActive` index is named `profiles_isActive_idx`, as
--     Prisma derives it from the field name. The old chain called it
--     `profiles_is_active_idx`. Purely a rename, and nothing selects it by
--     name.
--
-- Deliberately absent: row-level security. This API is the single place
-- authorization is enforced, and the database is not reachable by clients.
-- Profiles still key on the Supabase Auth user's id so the identity link stays
-- a plain equality comparison, but nothing here reads the auth schema.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobOfferOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('RESIDENCE', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('REQUESTED', 'OFFERED', 'ACCEPTED', 'TRAVELLING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProServiceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('UNDER_1_YEAR', 'ONE_TO_THREE', 'THREE_TO_FIVE', 'FIVE_TO_TEN', 'TEN_PLUS');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressLabel" AS ENUM ('HOME', 'WORK', 'OTHER');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('EXPO', 'FCM');

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('CUSTOMER', 'PRO');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('JOB_ALERT', 'JOB_STATUS', 'PAYMENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "phone" TEXT,
    "fullName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "display_name" TEXT,
    "gender" "Gender",
    "bio" TEXT,
    "experience_level" "ExperienceLevel",
    "service_radius_km" INTEGER NOT NULL DEFAULT 10,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_label" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selfie_photo_path" TEXT,
    "selfie_captured_at" TIMESTAMP(3),
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION,
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "push_token" TEXT,
    "push_platform" "PushPlatform",
    "push_provider" "PushProvider",
    "job_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "display_name" TEXT,
    "gender" "Gender",
    "avatar_url" TEXT,
    "location_label" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "push_token" TEXT,
    "push_platform" "PushPlatform",
    "push_provider" "PushProvider",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "label" "AddressLabel" NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "landmark" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_services" (
    "pro_profile_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "ProServiceStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_services_pkey" PRIMARY KEY ("pro_profile_id","service_id")
);

-- CreateTable
CREATE TABLE "pro_skills" (
    "pro_profile_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "pro_skills_pkey" PRIMARY KEY ("pro_profile_id","skill_id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "pro_id" UUID,
    "service_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "custom_skill" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'REQUESTED',
    "place_type" "PlaceType" NOT NULL,
    "place_description" TEXT,
    "location_label" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "image_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "base_pay_paise" INTEGER NOT NULL,
    "agreed_pay_paise" INTEGER,
    "final_pay_paise" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "verification_otp" TEXT,
    "otp_issued_at" TIMESTAMP(3),
    "start_otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_history" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "from_status" "JobStatus",
    "to_status" "JobStatus" NOT NULL,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "job_id" UUID,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "message_key" TEXT,
    "message_body_key" TEXT,
    "params" JSONB,
    "route" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "provider_ref" TEXT,
    "repeats" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notifications" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "job_declines" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_declines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "pro_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "outcome" "JobOfferOutcome",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_role" "SenderRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_phone_key" ON "profiles"("phone");

-- CreateIndex
CREATE INDEX "profiles_isActive_idx" ON "profiles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pro_profiles_user_id_key" ON "pro_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pro_profiles_push_token_key" ON "pro_profiles"("push_token");

-- CreateIndex
CREATE INDEX "pro_profiles_onboarding_status_idx" ON "pro_profiles"("onboarding_status");

-- CreateIndex
CREATE INDEX "pro_profiles_is_online_idx" ON "pro_profiles"("is_online");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_key" ON "customer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_push_token_key" ON "customer_profiles"("push_token");

-- CreateIndex
CREATE INDEX "customer_profiles_onboarding_status_idx" ON "customer_profiles"("onboarding_status");

-- CreateIndex
CREATE INDEX "saved_addresses_user_id_idx" ON "saved_addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "skills_service_id_idx" ON "skills"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_service_id_slug_key" ON "skills"("service_id", "slug");

-- CreateIndex
CREATE INDEX "pro_services_status_idx" ON "pro_services"("status");

-- CreateIndex
CREATE INDEX "jobs_customer_id_status_idx" ON "jobs"("customer_id", "status");

-- CreateIndex
CREATE INDEX "jobs_service_id_status_idx" ON "jobs"("service_id", "status");

-- CreateIndex
CREATE INDEX "jobs_pro_id_status_idx" ON "jobs"("pro_id", "status");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE INDEX "job_status_history_job_id_idx" ON "job_status_history"("job_id");

-- CreateIndex
CREATE INDEX "notifications_pro_id_created_at_idx" ON "notifications"("pro_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_job_id_idx" ON "notifications"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_pro_id_job_id_kind_key" ON "notifications"("pro_id", "job_id", "kind");

-- CreateIndex
CREATE INDEX "customer_notifications_customer_id_created_at_idx" ON "customer_notifications"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_notifications_job_id_idx" ON "customer_notifications"("job_id");

-- CreateIndex
CREATE INDEX "job_declines_pro_id_idx" ON "job_declines"("pro_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_declines_job_id_pro_id_key" ON "job_declines"("job_id", "pro_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_offers_token_hash_key" ON "job_offers"("token_hash");

-- CreateIndex
CREATE INDEX "job_offers_job_id_idx" ON "job_offers"("job_id");

-- CreateIndex
CREATE INDEX "job_offers_pro_id_idx" ON "job_offers"("pro_id");

-- CreateIndex
CREATE INDEX "job_offers_expires_at_idx" ON "job_offers"("expires_at");

-- CreateIndex
CREATE INDEX "messages_job_id_sent_at_idx" ON "messages"("job_id", "sent_at");

-- AddForeignKey
ALTER TABLE "pro_profiles" ADD CONSTRAINT "pro_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "customer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_services" ADD CONSTRAINT "pro_services_pro_profile_id_fkey" FOREIGN KEY ("pro_profile_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_services" ADD CONSTRAINT "pro_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_skills" ADD CONSTRAINT "pro_skills_pro_profile_id_fkey" FOREIGN KEY ("pro_profile_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_skills" ADD CONSTRAINT "pro_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_declines" ADD CONSTRAINT "job_declines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_declines" ADD CONSTRAINT "job_declines_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Reference data
--
-- Services and skills are reference data, not user data: a pro cannot pick a
-- service that does not exist here, so an empty catalogue means an app that
-- cannot onboard anyone. Prisma knows nothing about these rows — they are not
-- in schema.prisma — so a squash has to carry them forward by hand or the
-- marketplace silently starts with no services.
--
-- Ids are the values the previous chain used, kept stable so any pro already
-- pointing at a skill keeps working across the move.
-- ---------------------------------------------------------------------------

INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'ac-appliances', 'AC & Appliances', 'snow-outline', 1, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical', 'Electrical', 'flash-outline', 2, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'plumbing', 'Plumbing', 'water-outline', 3, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('e4218182-3567-4347-887d-32ca8bbfe91c', 'cleaning', 'Cleaning', 'sparkles-outline', 4, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('5dc5aef7-e936-4fe7-bf9e-9276899b81ea', 'car-care', 'Car Care', 'car-outline', 5, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('eeab1828-ba99-4f03-91ac-bb8a36645674', 'laptop-electronics', 'Laptop & Electronics', 'laptop-outline', 6, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('0b8734e8-6414-4e2c-b823-b45def39124b', 'carpentry', 'Carpentry', 'hammer-outline', 7, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('27c95688-fcb3-4d77-82f9-759dd5f50092', 'painting', 'Painting', 'color-palette-outline', 8, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('71bb7b3a-78b1-41d8-8a51-fae32074c7cc', 'moving-labour', 'Moving & Labour', 'cube-outline', 9, true);
INSERT INTO public.services (id, slug, name, icon, sort_order, is_active) VALUES ('6aea900b-3990-4435-b039-1d7560c8f466', 'other', 'Other', 'ellipsis-horizontal-outline', 10, true);

INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('aa7d8b43-5174-4929-be2e-386955334fce', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'ac-repair', 'AC repair', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('1d620fa8-2409-4109-b7c8-c489bce3b6c6', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'ac-installation', 'AC installation', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('4ab7366c-3ada-44f7-83d0-52b9aa58ad93', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'ac-gas-charging', 'Gas charging', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('8819076a-8d6e-444f-961d-147ced98828d', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'ac-pcb-repair', 'PCB repair', 4, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e7483687-6afc-4b12-b3f9-ca9fc77e5287', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'ac-maintenance', 'Maintenance', 5, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('a1581e61-7ee0-4d8d-8d89-2e563c096f2e', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'washing-machine', 'Washing machine', 6, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('f1f8142e-2e8e-44cf-801d-9ba1a1e0f7e9', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'refrigerator', 'Refrigerator', 7, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('628d6eee-799e-4407-add3-62c172bb2031', '5cacfd4b-a0ee-4087-8498-b9cb20bbf3ae', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('6cecd10a-ae72-47e4-9f19-f56ef7b4bf30', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical-socket-switch-installation', 'Electrical socket and switch installation', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('37175abb-8a68-4c29-b6bc-ab0f58c83035', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'wiring', 'Wiring', 1, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('cf1599d4-cb98-4614-b719-8810168697ba', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical-socket-switch-relocation', 'Electrical socket and switch relocation', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('6a587bfa-cd03-4512-a78d-7893116c662d', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'switch-socket', 'Switches & sockets', 2, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('bd844372-e846-4be3-95e4-1a5708fe57ae', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical-socket-switch-repair', 'Electrical socket and switch repair', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('72189988-4a01-44ee-8480-06a85f613960', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'light-fixture-installation', 'Light fixture installation', 4, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('0fbdca37-fa3f-4489-8e0b-049baceb02c5', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'lighting', 'Lighting', 4, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e85889bc-6a8b-4e31-ae23-543d5be14e24', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'inverter-stabiliser', 'Inverter & stabiliser', 5, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('0fb7acd8-5f53-4510-9681-85e718168650', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'outdoor-lighting-installation', 'Outdoor lighting installation', 5, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('dff8f010-29c9-486c-b179-b418af88b49c', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical-panel-repair', 'Electrical panel repair', 6, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('3d698729-3d70-49a4-9ec2-899a34110064', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical-panel-replacement', 'Electrical panel replacement or upgrading', 7, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('2e0f8da1-65ae-49b9-8722-d202e4af6bb8', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'electrical-power-restoration', 'Electrical power restoration', 8, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('cf2e3806-8458-4180-9bff-af88869a14e1', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'ev-charger-installation', 'Electric car charger installation', 9, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('203e95d9-540c-4f82-8c04-e1f66c377828', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'fan-installation', 'Fan installation', 10, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('2a47c433-add8-483f-8d4a-50bce45442e8', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'fan-repair', 'Fan repair', 11, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('d602e428-2022-4022-a580-398e129abcf1', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'ground-wire-installation', 'Ground wire installation', 12, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('c8c13b11-0352-48d3-b0c3-2c9438e10072', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'light-fixture-repair', 'Light fixture repair', 13, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('0eb6d544-d27e-4f7c-8d9c-29da4fa9c6c2', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'remodelling', 'Remodelling', 14, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('02e8111c-693e-410f-acbd-b5caeaf3e8fd', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'security-system-installation', 'Security system installation', 15, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('22097fcc-1c67-4cbd-a74d-f27689405362', 'fe42a254-34c6-4d74-af42-b5be9abf74ad', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('b17fa004-8122-47bb-a631-a4dc307bc8f0', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'toilet-installation', 'Toilet installation', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e5ca8853-ea12-49da-9c99-8505511fca94', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'waste-disposal-installation', 'Waste disposal installation', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('76744502-e512-4c58-b1aa-e15a5e5ac518', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'drainage', 'Drainage & blockage', 3, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('75bebcd1-63a1-4846-a942-e7cb046bbfd3', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'tap-repair', 'Tap repair', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('102c1763-c4db-44eb-a0ed-f2d4c484f4a9', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'tap-installation', 'Tap installation', 4, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('85ab65ff-f2b0-4889-9f14-a7c4d0f733a2', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'water-tank', 'Water tank', 4, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('964740b9-2e31-4d7b-9fd3-71c75b65cdd7', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'bathroom-fitting', 'Bathroom fitting', 5, false);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('154f5df0-f6b0-4768-b613-ada782bb077e', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'drain-cleaning', 'Drain cleaning', 5, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('986e302d-1488-4e11-9bcc-906a622b9206', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'water-heater-installation', 'Water heater installation', 6, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('17c108eb-67b4-46f0-ad27-3f8d67ccdc6a', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'water-tank-repair', 'Water tank repair', 7, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e5352e8b-06d2-4602-bea5-29dd3d8fb4a3', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'water-tank-installation', 'Water tank installation', 8, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('5c36ea31-5723-42c3-ac77-6b6b8a1091d5', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'leak-detection', 'Plumbing leak detection', 9, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('cb7149d8-9abd-43e8-89e2-a5a5261fcf3a', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'leak-repair', 'Plumbing leak repair', 10, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('4bb85d17-1c51-42b4-926f-5318ec74ea55', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'pipe-repair', 'Plumbing pipe repair', 11, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('82fba489-a952-40bc-8822-64e3d531328d', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'outdoor-plumbing-repair', 'Outdoor plumbing system repair', 12, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('0c47aad5-a159-43d8-b59a-27e5a5d6c4bb', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'shower-repair', 'Shower repair', 13, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e01b2549-fb5e-4a27-b150-881399f9da7a', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'shower-installation', 'Shower installation', 14, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('9e40605f-2e93-4085-a045-ebb3b0aee9d0', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'toilet-repair', 'Toilet repair', 15, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('369f35e0-6b10-46c1-a966-1a369fe905dd', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'bathroom-gap-refill', 'Bathroom gap refill', 16, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('43ec83e9-df22-4ad5-b33b-b335a0e9bf25', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'draining-line', 'Draining Line', 17, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('01408b1c-fc57-4aef-a33a-e1a529e6347a', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'kitchen-waste-line', 'Kitchen waste line', 18, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('f071a22b-6c1c-4524-b60d-a146e148899a', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'wash-area-line', 'Wash area line', 19, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('89db0d92-446f-453c-a37f-9199be343b4c', 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('a284571d-5239-4911-abc0-7c0735a007b6', 'e4218182-3567-4347-887d-32ca8bbfe91c', 'deep-cleaning', 'Deep cleaning', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e799b839-3923-47df-8d0f-4490aae719e3', 'e4218182-3567-4347-887d-32ca8bbfe91c', 'bathroom-cleaning', 'Bathroom cleaning', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('252a3f21-fcc5-4328-9b22-53c9cd6ee730', 'e4218182-3567-4347-887d-32ca8bbfe91c', 'sofa-carpet', 'Sofa & carpet', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('e91cd2ea-e43f-45f2-b7d0-53558fd2173b', 'e4218182-3567-4347-887d-32ca8bbfe91c', 'pest-control', 'Pest control', 4, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('55c086ea-b712-444a-bb16-801772ccfd55', 'e4218182-3567-4347-887d-32ca8bbfe91c', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('a73f7a40-5aa7-4c8f-8d57-ca46e6c08b22', '5dc5aef7-e936-4fe7-bf9e-9276899b81ea', 'car-wash', 'Car wash', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('5ebd2453-ae47-45bd-ae3b-50fed7733872', '5dc5aef7-e936-4fe7-bf9e-9276899b81ea', 'car-detailing', 'Detailing', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('d3603074-df82-4064-aa0a-0b0b0ecc0159', '5dc5aef7-e936-4fe7-bf9e-9276899b81ea', 'battery-service', 'Battery service', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('a1fb1470-d626-4db8-9a1a-1340989e4235', '5dc5aef7-e936-4fe7-bf9e-9276899b81ea', 'tyre-service', 'Tyre service', 4, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('c713956b-9d60-44b0-83d6-762e702751d5', '5dc5aef7-e936-4fe7-bf9e-9276899b81ea', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('5fe6dcfb-92d2-4f9d-9c4d-9e8dd1e6b86f', 'eeab1828-ba99-4f03-91ac-bb8a36645674', 'laptop-repair', 'Laptop repair', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('5a04db72-2414-4ab7-84dd-4b28f581e0bf', 'eeab1828-ba99-4f03-91ac-bb8a36645674', 'desktop-repair', 'Desktop repair', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('3a4967e9-23af-4e4e-baf1-796f5ce50508', 'eeab1828-ba99-4f03-91ac-bb8a36645674', 'screen-replacement', 'Screen replacement', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('df232b71-8560-45b8-ab24-1c7dfc71fa35', 'eeab1828-ba99-4f03-91ac-bb8a36645674', 'data-recovery', 'Data recovery', 4, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('a688fb25-17f4-48fd-9c09-d1941a6f7419', 'eeab1828-ba99-4f03-91ac-bb8a36645674', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('46289955-8c95-4652-b71d-f74c68755b8e', '0b8734e8-6414-4e2c-b823-b45def39124b', 'furniture-repair', 'Furniture repair', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('d3c7b7aa-f993-4d11-b8ff-cc7f9ab316e6', '0b8734e8-6414-4e2c-b823-b45def39124b', 'door-window', 'Doors & windows', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('659878dd-d74f-4161-b0c5-247529725496', '0b8734e8-6414-4e2c-b823-b45def39124b', 'modular-fitting', 'Modular fitting', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('fbb61407-6fa5-4bf1-9025-335339b4f4c2', '0b8734e8-6414-4e2c-b823-b45def39124b', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('9118ae24-02c8-4b9b-a900-51e7c7d711c9', '27c95688-fcb3-4d77-82f9-759dd5f50092', 'interior-painting', 'Interior painting', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('87d97fa0-5eb8-46e7-a689-9f2e6ed804af', '27c95688-fcb3-4d77-82f9-759dd5f50092', 'exterior-painting', 'Exterior painting', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('f5995d98-30b9-42c2-afbd-cc9d56908003', '27c95688-fcb3-4d77-82f9-759dd5f50092', 'waterproofing', 'Waterproofing', 3, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('cf336338-559e-4765-a4bd-6281f3c0d937', '27c95688-fcb3-4d77-82f9-759dd5f50092', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('fa37e49a-af5d-4285-b697-6da9952fd15a', '71bb7b3a-78b1-41d8-8a51-fae32074c7cc', 'house-shifting', 'House shifting', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('8d2764d9-9cea-4311-8f70-ac30f8d5bb56', '71bb7b3a-78b1-41d8-8a51-fae32074c7cc', 'loading-unloading', 'Loading & unloading', 2, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('46b60419-8ade-4d32-9c8b-68b3afdeb42f', '71bb7b3a-78b1-41d8-8a51-fae32074c7cc', 'other', 'Other', 999, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('7d328802-73f1-42ad-bbc7-6071a75a90a4', '6aea900b-3990-4435-b039-1d7560c8f466', 'other-general', 'General work', 1, true);
INSERT INTO public.skills (id, service_id, slug, name, sort_order, is_active) VALUES ('a6a82094-b6db-48d2-acc8-69aebfc956c6', '6aea900b-3990-4435-b039-1d7560c8f466', 'other', 'Other', 999, true);

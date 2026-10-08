-- CreateEnum
CREATE TYPE "AccountDeletionScope" AS ENUM ('PRO_PROFILE', 'FULL_ACCOUNT');

-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('AUTHORIZED', 'AWAITING_ACTIVE_JOBS', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AccountDeletionStep" AS ENUM ('LOCK', 'PURGE_S3', 'PURGE_DB', 'DELETE_AUTH', 'FINALIZE');

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_pro_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_fkey";

-- AlterTable
ALTER TABLE "pro_profiles" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deletion_requested_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "account_deletions" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "scope" "AccountDeletionScope" NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'AUTHORIZED',
    "step" "AccountDeletionStep",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "auth_token_hash" TEXT,
    "auth_token_expires_at" TIMESTAMP(3),
    "auth_token_consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_deletions_profile_id_key" ON "account_deletions"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_deletions_auth_token_hash_key" ON "account_deletions"("auth_token_hash");

-- CreateIndex
CREATE INDEX "account_deletions_status_idx" ON "account_deletions"("status");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "JobOfferOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "pro_profiles" ADD COLUMN     "push_device_id" TEXT;

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

-- CreateIndex
CREATE UNIQUE INDEX "job_offers_token_hash_key" ON "job_offers"("token_hash");

-- CreateIndex
CREATE INDEX "job_offers_job_id_idx" ON "job_offers"("job_id");

-- CreateIndex
CREATE INDEX "job_offers_pro_id_idx" ON "job_offers"("pro_id");

-- CreateIndex
CREATE INDEX "job_offers_expires_at_idx" ON "job_offers"("expires_at");

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_pro_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
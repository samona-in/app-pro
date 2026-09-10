-- CreateEnum
CREATE TYPE "ProServiceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "pro_services"
  ADD COLUMN "status" "ProServiceStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "pro_services_status_idx" ON "pro_services"("status");
-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ID_PROOF', 'ADDRESS_PROOF', 'PAYOUT_PROOF', 'TRADE_LICENCE', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "pro_documents" (
    "id" UUID NOT NULL,
    "pro_profile_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pro_documents_storage_path_key" ON "pro_documents"("storage_path");

-- CreateIndex
CREATE INDEX "pro_documents_pro_profile_id_idx" ON "pro_documents"("pro_profile_id");

-- AddForeignKey
ALTER TABLE "pro_documents" ADD CONSTRAINT "pro_documents_pro_profile_id_fkey" FOREIGN KEY ("pro_profile_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

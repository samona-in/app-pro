-- CreateEnum
CREATE TYPE "LegalHoldHolderType" AS ENUM ('PROFILE', 'PRO_PROFILE', 'DOCUMENT', 'JOB', 'CUSTOMER_PROFILE', 'OTHER');

-- CreateTable
CREATE TABLE "cleanup_audit_logs" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    "execution_mode" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "metadata" JSONB,
    "job_id" TEXT,

    CONSTRAINT "cleanup_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL,
    "holder_type" "LegalHoldHolderType" NOT NULL,
    "holder_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorized_by" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "released_at" TIMESTAMP(3),
    "released_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cleanup_audit_logs_category_started_at_idx" ON "cleanup_audit_logs"("category", "started_at");

-- CreateIndex
CREATE INDEX "legal_holds_holder_type_holder_id_active_idx" ON "legal_holds"("holder_type", "holder_id", "active");

-- CreateIndex
CREATE INDEX "legal_holds_active_expires_at_idx" ON "legal_holds"("active", "expires_at");

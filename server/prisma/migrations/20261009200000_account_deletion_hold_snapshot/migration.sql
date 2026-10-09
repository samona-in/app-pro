-- Freeze the legal-hold decision on the deletion row so PURGE_S3 and PURGE_DB
-- consume one immutable snapshot instead of re-querying holds independently
-- (a hold created between the two steps could otherwise make the DB step
-- preserve a row whose object the S3 step had already deleted).

-- AlterTable
ALTER TABLE "account_deletions" ADD COLUMN     "held_document_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "holds_captured_at" TIMESTAMP(3),
ADD COLUMN     "profile_held" BOOLEAN NOT NULL DEFAULT false;

-- Customer-surface account deletion: a customer may now delete only their
-- customer surface (CUSTOMER_PROFILE) or the whole identity (FULL_ACCOUNT).
-- The CustomerProfile is tombstoned like ProProfile (key kept, PII nulled) so
-- historical jobs and their status history never dangle, and `jobs.customer_id`
-- becomes RESTRICT for the same reason `jobs.pro_id` already is: profiles are
-- never hard-deleted, so the constraint can never fire — it guards a future bug.

-- AlterEnum
ALTER TYPE "AccountDeletionScope" ADD VALUE 'CUSTOMER_PROFILE';

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_customer_id_fkey";

-- AlterTable
ALTER TABLE "customer_profiles" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deletion_requested_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

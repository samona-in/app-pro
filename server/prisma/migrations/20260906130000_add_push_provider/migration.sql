-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('EXPO', 'FCM');

-- AlterTable
ALTER TABLE "pro_profiles" ADD COLUMN     "push_provider" "PushProvider";
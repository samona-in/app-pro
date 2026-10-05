-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');

-- AlterTable
ALTER TABLE "pro_profiles" ADD COLUMN     "push_platform" "PushPlatform";


-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "pro_profiles" ADD COLUMN "gender" "Gender";

-- AlterTable
ALTER TABLE "customer_profiles" ADD COLUMN "gender" "Gender";
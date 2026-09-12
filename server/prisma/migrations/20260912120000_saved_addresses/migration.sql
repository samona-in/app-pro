-- SAMONA Customer: saved addresses.
--
-- The label enum, one row per saved place, and a customer -> address foreign
-- key. One customer may keep several labelled addresses; the single default
-- is enforced by the service in a transaction (the schema only sums it up).

-- CreateEnum
CREATE TYPE "AddressLabel" AS ENUM ('HOME', 'WORK', 'OTHER');

-- CreateTable
CREATE TABLE "saved_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" "AddressLabel" NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "landmark" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_addresses_user_id_idx" ON "saved_addresses"("user_id");

-- AddForeignKey
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "customer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SAMONA Customer: add a name to each saved address.
--
-- Free-text customer name, required for every saved address from now on.
-- New rows always carry it (the API validates it); '' backfills the rows
-- that exist before this migration so the NOT NULL constraint is satisfiable.

-- AlterTable
ALTER TABLE "saved_addresses" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
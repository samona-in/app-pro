-- The booking flow no longer asks where the work happens: the customer's
-- service address is the location, so the extra RESIDENCE/OFFICE/OTHER bucket
-- was a redundant step. Drop the now-unused columns and enum.
ALTER TABLE "jobs" DROP COLUMN "place_description";
ALTER TABLE "jobs" DROP COLUMN "place_type";
DROP TYPE "PlaceType";

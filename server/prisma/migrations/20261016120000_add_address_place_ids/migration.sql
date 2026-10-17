-- Durable Google place ids for re-resolving address labels on read.
--
-- The switch to Google geocoding introduced a durable identifier for a place.
-- Storing it alongside the coordinates lets the display label be refreshed
-- later instead of baked in, which keeps stored provider content within its
-- permitted caching window (a Google place id may be stored indefinitely; other
-- content may not). This is additive and nullable: rows written before the
-- switch have no place id and simply keep the label they already hold, and no
-- backfill is possible because the previous (OSM) provider issued no such ids.

ALTER TABLE "saved_addresses" ADD COLUMN "place_id" TEXT;
ALTER TABLE "customer_profiles" ADD COLUMN "location_place_id" TEXT;
ALTER TABLE "pro_profiles" ADD COLUMN "location_place_id" TEXT;

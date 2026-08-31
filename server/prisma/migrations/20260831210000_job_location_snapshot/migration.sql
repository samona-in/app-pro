-- Job location snapshot.
--
-- Jobs previously inherited the customer's single saved location from
-- `customer_profiles` at read time, so a job booked away from home (say an
-- office) was matched and displayed against the wrong coordinates. Copy the
-- work location onto the job when it is created: the customer may submit a
-- per-job location, and when they do not the customer profile's saved location
-- is snapshotted here. Matching, distance, ETA and the pro-facing label all
-- read from these columns so each job stands on its own.

ALTER TABLE "jobs"
  ADD COLUMN "location_label" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

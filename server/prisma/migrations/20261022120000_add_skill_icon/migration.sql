-- Icons for skills.
--
-- A skill now carries an icon of its own, the way a service does, so a
-- catalogue row can be rendered without borrowing its parent's image. The
-- column is nullable and additive: rows written before the switch have no
-- icon until the backfill below fills them in.
--
-- The backfill copies the parent service's icon onto each of its skills, so
-- the two agree today and a skill can be given an icon of its own later
-- without anyone having to revisit the catalogue.

ALTER TABLE "skills" ADD COLUMN "icon" TEXT;

UPDATE "skills" AS s
SET "icon" = sv."icon"
FROM "services" AS sv
WHERE s."service_id" = sv."id";

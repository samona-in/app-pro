-- AlterTable
ALTER TABLE "popular_skills" ADD COLUMN "is_top_pick" BOOLEAN NOT NULL DEFAULT false;

-- Set the first item as top pick by sort order
UPDATE "popular_skills"
SET "is_top_pick" = true
WHERE "id" IN (
  SELECT "id"
  FROM "popular_skills"
  WHERE "is_active" = true
  ORDER BY "sort_order" ASC, "created_at" ASC
  LIMIT 1
);

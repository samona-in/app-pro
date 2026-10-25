-- CreateTable
CREATE TABLE "popular_skills" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "popular_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "popular_skills_skill_id_key" ON "popular_skills"("skill_id");

-- CreateIndex
CREATE INDEX "popular_skills_is_active_sort_order_idx" ON "popular_skills"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "popular_skills" ADD CONSTRAINT "popular_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed from existing curated popular skills
INSERT INTO "popular_skills" ("id", "skill_id", "sort_order", "is_active", "updated_at")
SELECT 
  gen_random_uuid(),
  s.id,
  CASE s.slug
    WHEN 'leak-repair' THEN 0
    WHEN 'tap-repair' THEN 1
    WHEN 'drain-cleaning' THEN 2
    WHEN 'fan-installation' THEN 3
    WHEN 'light-fixture-installation' THEN 4
    ELSE 99
  END,
  true,
  CURRENT_TIMESTAMP
FROM "skills" s
WHERE s.slug IN ('leak-repair', 'tap-repair', 'drain-cleaning', 'fan-installation', 'light-fixture-installation')
  AND s.is_active = true
ORDER BY 
  CASE s.slug
    WHEN 'leak-repair' THEN 0
    WHEN 'tap-repair' THEN 1
    WHEN 'drain-cleaning' THEN 2
    WHEN 'fan-installation' THEN 3
    WHEN 'light-fixture-installation' THEN 4
  END;

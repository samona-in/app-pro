-- CreateTable
CREATE TABLE "service_work_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_work_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_work_groups_service_id_slug_key" ON "service_work_groups"("service_id", "slug");

-- CreateIndex
CREATE INDEX "service_work_groups_service_id_idx" ON "service_work_groups"("service_id");

-- AddForeignKey
ALTER TABLE "service_work_groups" ADD CONSTRAINT "service_work_groups_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "skills" ADD COLUMN "group_id" UUID;

-- CreateIndex
CREATE INDEX "skills_group_id_idx" ON "skills"("group_id");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "service_work_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

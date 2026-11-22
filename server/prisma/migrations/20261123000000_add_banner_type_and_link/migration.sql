-- CreateEnum
CREATE TYPE "BannerType" AS ENUM ('PROMO', 'IMAGE');

-- AlterTable: existing rows keep their promo rendering; linkUrl is opt-in.
ALTER TABLE "banners"
    ADD COLUMN "type" "BannerType" NOT NULL DEFAULT 'PROMO',
    ADD COLUMN "link_url" TEXT;

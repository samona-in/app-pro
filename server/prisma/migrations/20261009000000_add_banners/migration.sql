-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "cta_label" TEXT NOT NULL,
    "service_slug" TEXT,
    "image" TEXT NOT NULL,
    "image_description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banners_key_key" ON "banners"("key");

-- CreateIndex
CREATE INDEX "banners_is_active_sort_order_idx" ON "banners"("is_active", "sort_order");

-- Seed with existing banners
INSERT INTO "banners" ("id", "key", "heading", "subtitle", "cta_label", "service_slug", "image", "image_description", "sort_order", "is_active", "updated_at") VALUES
('a1b2c3d4-e5f6-4a5b-8c9d-1e2f3a4b5c6d', 'home-care', 'Your home needs care.', 'We''ve got the right people.', 'Explore Services', NULL, 'banner-1.png', 'A service professional working on a home electrical installation', 0, true, CURRENT_TIMESTAMP),
('b2c3d4e5-f6a7-4b5c-9d1e-2f3a4b5c6d7e', 'electrical', 'Electrical problems?', 'Find a professional near you.', 'Find an Electrician', 'electrical', 'banner-2.png', 'An electrician testing a switchboard with a screwdriver', 1, true, CURRENT_TIMESTAMP),
('c3d4e5f6-a7b8-4c5d-1e2f-3a4b5c6d7e8f', 'plumbing', 'Leaky tap? Get it fixed.', 'Connect with local plumbing professionals.', 'Find a Plumber', 'plumbing', 'banner-3.png', 'A plumber repairing a kitchen sink with a spanner', 2, true, CURRENT_TIMESTAMP),
('d4e5f6a7-b8c9-4d5e-2f3a-4b5c6d7e8f9a', 'cleaning', 'A cleaner home, made easier.', 'Find trusted cleaning professionals nearby.', 'Explore Cleaning', 'cleaning', 'banner-4.png', 'A cleaning professional spraying a living room sofa', 3, true, CURRENT_TIMESTAMP);

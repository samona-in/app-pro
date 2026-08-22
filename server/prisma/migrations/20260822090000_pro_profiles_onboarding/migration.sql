-- SAMONA Pro: identity/profile split, professional onboarding, RLS.
--
-- `users` becomes `profiles` by RENAME rather than drop-and-create, so any
-- account already produced by signing in survives. Prisma's generated diff
-- wanted to DROP the table; the columns are identical, so a rename is
-- equivalent and non-destructive.

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('UNDER_1_YEAR', 'ONE_TO_THREE', 'THREE_TO_FIVE', 'FIVE_TO_TEN', 'TEN_PLUS');

-- Rename users -> profiles, including the constraints and indexes, so the
-- names match what Prisma expects from here on. Postgres does not rename
-- these automatically when the table is renamed.
ALTER TABLE "users" RENAME TO "profiles";
ALTER TABLE "profiles" RENAME CONSTRAINT "users_pkey" TO "profiles_pkey";
ALTER TABLE "profiles" RENAME CONSTRAINT "users_id_fkey" TO "profiles_id_fkey";
ALTER INDEX "users_email_key" RENAME TO "profiles_email_key";
ALTER INDEX "users_phone_key" RENAME TO "profiles_phone_key";
ALTER INDEX "users_role_idx" RENAME TO "profiles_role_idx";

-- CreateTable
CREATE TABLE "pro_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "display_name" TEXT,
    "bio" TEXT,
    "experience_level" "ExperienceLevel",
    "service_radius_km" INTEGER NOT NULL DEFAULT 10,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_label" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION,
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_services" (
    "pro_profile_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,

    CONSTRAINT "pro_services_pkey" PRIMARY KEY ("pro_profile_id","service_id")
);

-- CreateTable
CREATE TABLE "pro_skills" (
    "pro_profile_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "pro_skills_pkey" PRIMARY KEY ("pro_profile_id","skill_id")
);

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "pro_profiles_user_id_key" ON "pro_profiles"("user_id");

-- CreateIndex
CREATE INDEX "pro_profiles_onboarding_status_idx" ON "pro_profiles"("onboarding_status");

-- CreateIndex
CREATE INDEX "pro_profiles_is_online_idx" ON "pro_profiles"("is_online");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE INDEX "skills_service_id_idx" ON "skills"("service_id");

-- AddForeignKey
ALTER TABLE "pro_profiles" ADD CONSTRAINT "pro_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_services" ADD CONSTRAINT "pro_services_pro_profile_id_fkey" FOREIGN KEY ("pro_profile_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_services" ADD CONSTRAINT "pro_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_skills" ADD CONSTRAINT "pro_skills_pro_profile_id_fkey" FOREIGN KEY ("pro_profile_id") REFERENCES "pro_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_skills" ADD CONSTRAINT "pro_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Auth trigger: create the profile row when Supabase creates the auth user.
-- ---------------------------------------------------------------------------
--
-- Doing this in the database rather than from the client means the profile
-- exists the instant sign-up succeeds, with no window where an authenticated
-- user has no identity row, and no way for a client to skip it.
--
-- SECURITY DEFINER is required: the trigger runs as the auth service, which has
-- no rights on `public`. `search_path` is pinned empty and every name is
-- schema-qualified — a SECURITY DEFINER function with a mutable search_path is
-- a privilege-escalation vector.
--
-- ON CONFLICT DO NOTHING keeps it idempotent, so a retried insert cannot fail
-- signup. A trigger that raises on auth.users breaks sign-up entirely.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."profiles" ("id", "phone", "email", "role", "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    NULLIF(NEW.phone, ''),
    NULLIF(NEW.email, ''),
    'PRO',
    NOW(),
    NOW()
  )
  ON CONFLICT ("id") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- The Express API is the enforcement point and connects as a role that bypasses
-- RLS, so these policies do not govern it. They are defence in depth for the
-- mobile client, which holds the publishable key: if it ever queries Supabase
-- directly, or the key leaks, a caller can still only reach their own rows.

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pro_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pro_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pro_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;

-- Identity: a user sees and edits only their own row.
CREATE POLICY "profiles_select_own" ON "profiles"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "id");

-- No INSERT policy on purpose: rows come from the trigger, never from a client.
CREATE POLICY "profiles_update_own" ON "profiles"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = "id")
  WITH CHECK ((SELECT auth.uid()) = "id");

-- Professional profile: scoped through the owning profile.
CREATE POLICY "pro_profiles_select_own" ON "pro_profiles"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");

CREATE POLICY "pro_profiles_insert_own" ON "pro_profiles"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = "user_id");

CREATE POLICY "pro_profiles_update_own" ON "pro_profiles"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = "user_id")
  WITH CHECK ((SELECT auth.uid()) = "user_id");

-- Server-controlled columns.
--
-- RLS grants access to rows, not columns, so an UPDATE policy alone would let a
-- Pro set their own is_verified, rating or role.
--
-- Column privileges must be expressed as an ALLOW-LIST, not as revokes.
-- Postgres cannot subtract a column privilege from a table-level grant: if
-- `authenticated` holds UPDATE on the table — which it does by default in
-- Supabase — then `REVOKE UPDATE (col)` silently does nothing and the column
-- stays writable. The table-level grant must be dropped first.
REVOKE UPDATE ON "pro_profiles" FROM authenticated;
GRANT UPDATE (
  "display_name",
  "bio",
  "experience_level",
  "service_radius_km",
  "latitude",
  "longitude",
  "location_label",
  "languages"
) ON "pro_profiles" TO authenticated;

REVOKE UPDATE ON "profiles" FROM authenticated;
GRANT UPDATE ("fullName", "avatarUrl") ON "profiles" TO authenticated;

-- Everything omitted above is server-only: is_verified, rating, completed_jobs,
-- is_online, onboarding_status, user_id, id, role and phone. The API writes
-- them as the connection role, which bypasses RLS by design.

-- Join tables inherit ownership from the pro profile they point at.
CREATE POLICY "pro_services_own" ON "pro_services"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "pro_profiles" p
    WHERE p."id" = "pro_services"."pro_profile_id" AND p."user_id" = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "pro_profiles" p
    WHERE p."id" = "pro_services"."pro_profile_id" AND p."user_id" = (SELECT auth.uid())
  ));

CREATE POLICY "pro_skills_own" ON "pro_skills"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "pro_profiles" p
    WHERE p."id" = "pro_skills"."pro_profile_id" AND p."user_id" = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "pro_profiles" p
    WHERE p."id" = "pro_skills"."pro_profile_id" AND p."user_id" = (SELECT auth.uid())
  ));

-- The catalogue is public reference data: readable by any signed-in user,
-- writable by none.
CREATE POLICY "services_read" ON "services"
  FOR SELECT TO authenticated USING ("is_active" = true);

CREATE POLICY "skills_read" ON "skills"
  FOR SELECT TO authenticated USING ("is_active" = true);

-- ---------------------------------------------------------------------------
-- Service catalogue seed
-- ---------------------------------------------------------------------------
--
-- Seeded in the migration rather than a seed script so every environment has
-- the same slugs — onboarding selections reference them by slug, and a missing
-- row would break step 3. Idempotent so re-running is harmless.

INSERT INTO "services" ("id", "slug", "name", "icon", "sort_order") VALUES
  (gen_random_uuid(), 'ac-appliances',  'AC & Appliances',      'snow-outline',        1),
  (gen_random_uuid(), 'electrical',     'Electrical',           'flash-outline',       2),
  (gen_random_uuid(), 'plumbing',       'Plumbing',             'water-outline',       3),
  (gen_random_uuid(), 'cleaning',       'Cleaning',             'sparkles-outline',    4),
  (gen_random_uuid(), 'car-care',       'Car Care',             'car-outline',         5),
  (gen_random_uuid(), 'laptop-electronics', 'Laptop & Electronics', 'laptop-outline',  6),
  (gen_random_uuid(), 'carpentry',      'Carpentry',            'hammer-outline',      7),
  (gen_random_uuid(), 'painting',       'Painting',             'color-palette-outline', 8),
  (gen_random_uuid(), 'moving-labour',  'Moving & Labour',      'cube-outline',        9),
  (gen_random_uuid(), 'other',          'Other',                'ellipsis-horizontal-outline', 10)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "skills" ("id", "service_id", "slug", "name", "sort_order")
SELECT gen_random_uuid(), s."id", v.slug, v.name, v.sort_order
FROM (VALUES
  ('ac-appliances', 'ac-repair',          'AC repair',            1),
  ('ac-appliances', 'ac-installation',    'AC installation',      2),
  ('ac-appliances', 'ac-gas-charging',    'Gas charging',         3),
  ('ac-appliances', 'ac-pcb-repair',      'PCB repair',           4),
  ('ac-appliances', 'ac-maintenance',     'Maintenance',          5),
  ('ac-appliances', 'washing-machine',    'Washing machine',      6),
  ('ac-appliances', 'refrigerator',       'Refrigerator',         7),
  ('electrical',    'wiring',             'Wiring',               1),
  ('electrical',    'switch-socket',      'Switches & sockets',   2),
  ('electrical',    'fan-installation',   'Fan installation',     3),
  ('electrical',    'lighting',           'Lighting',             4),
  ('electrical',    'inverter-stabiliser','Inverter & stabiliser',5),
  ('plumbing',      'leak-repair',        'Leak repair',          1),
  ('plumbing',      'tap-installation',   'Tap installation',     2),
  ('plumbing',      'drainage',           'Drainage & blockage',  3),
  ('plumbing',      'water-tank',         'Water tank',           4),
  ('plumbing',      'bathroom-fitting',   'Bathroom fitting',     5),
  ('cleaning',      'deep-cleaning',      'Deep cleaning',        1),
  ('cleaning',      'bathroom-cleaning',  'Bathroom cleaning',    2),
  ('cleaning',      'sofa-carpet',        'Sofa & carpet',        3),
  ('cleaning',      'pest-control',       'Pest control',         4),
  ('car-care',      'car-wash',           'Car wash',             1),
  ('car-care',      'car-detailing',      'Detailing',            2),
  ('car-care',      'battery-service',    'Battery service',      3),
  ('car-care',      'tyre-service',       'Tyre service',         4),
  ('laptop-electronics', 'laptop-repair', 'Laptop repair',        1),
  ('laptop-electronics', 'desktop-repair','Desktop repair',       2),
  ('laptop-electronics', 'screen-replacement', 'Screen replacement', 3),
  ('laptop-electronics', 'data-recovery', 'Data recovery',        4),
  ('carpentry',     'furniture-repair',   'Furniture repair',     1),
  ('carpentry',     'door-window',        'Doors & windows',      2),
  ('carpentry',     'modular-fitting',    'Modular fitting',      3),
  ('painting',      'interior-painting',  'Interior painting',    1),
  ('painting',      'exterior-painting',  'Exterior painting',    2),
  ('painting',      'waterproofing',      'Waterproofing',        3),
  ('moving-labour', 'house-shifting',     'House shifting',       1),
  ('moving-labour', 'loading-unloading',  'Loading & unloading',  2),
  ('other',         'other-general',      'General work',         1)
) AS v(service_slug, slug, name, sort_order)
JOIN "services" s ON s."slug" = v.service_slug
ON CONFLICT ("slug") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Fix the Electrical skill catalogue (service slug is `electrician`)
-- ---------------------------------------------------------------------------
-- `20260830200000_expand_job_skills` joined its Electrical VALUES rows on the
-- service slug `electrical`, but that service's real slug is `electrician`, so
-- the 15 rows never landed on any environment and the old coarse onboarding
-- skill(s) stayed active there. Plumbing (slug `plumbing`) matched and is not
-- touched here.
--
-- This migration is idempotent: it deactivates whatever the Electrician
-- service currently carries and upserts the canonical 15-skill catalogue, so it
-- heals databases that already ran the buggy migration and completes fresh
-- ones identically.

UPDATE "skills" SET "is_active" = false
WHERE "service_id" = (SELECT "id" FROM "services" WHERE "slug" = 'electrician');

INSERT INTO "skills" ("id", "service_id", "slug", "name", "sort_order", "is_active")
SELECT gen_random_uuid(), s."id", v.slug, v.name, v.sort_order, true
FROM (VALUES
  ('electrician', 'electrical-socket-switch-installation', 'Electrical socket and switch installation', 1),
  ('electrician', 'electrical-socket-switch-relocation',    'Electrical socket and switch relocation',    2),
  ('electrician', 'electrical-socket-switch-repair',        'Electrical socket and switch repair',        3),
  ('electrician', 'light-fixture-installation',             'Light fixture installation',                 4),
  ('electrician', 'outdoor-lighting-installation',          'Outdoor lighting installation',              5),
  ('electrician', 'electrical-panel-repair',                'Electrical panel repair',                    6),
  ('electrician', 'electrical-panel-replacement',           'Electrical panel replacement or upgrading',  7),
  ('electrician', 'electrical-power-restoration',           'Electrical power restoration',               8),
  ('electrician', 'ev-charger-installation',                'Electric car charger installation',          9),
  ('electrician', 'fan-installation',                       'Fan installation',                          10),
  ('electrician', 'fan-repair',                             'Fan repair',                                11),
  ('electrician', 'ground-wire-installation',               'Ground wire installation',                  12),
  ('electrician', 'light-fixture-repair',                   'Light fixture repair',                      13),
  ('electrician', 'remodelling',                            'Remodelling',                               14),
  ('electrician', 'security-system-installation',           'Security system installation',              15)
) AS v(service_slug, slug, name, sort_order)
JOIN "services" s ON s."slug" = v.service_slug
ON CONFLICT ("slug") DO UPDATE SET
  "service_id" = EXCLUDED."service_id",
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
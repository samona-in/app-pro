-- ---------------------------------------------------------------------------
-- Expand the Electrical and Plumbing skill catalogues for job booking
-- ---------------------------------------------------------------------------
--
-- The customer booking flow asks the customer to pick the exact job category,
-- so the catalogue needs fine-grained options ("Light fixture installation",
-- "Shower repair", ...) rather than the coarse onboarding buckets. Old entries
-- are deactivated (never deleted) so an existing ProSkill foreign key pointing
-- at one cannot break. Re-running this migration is harmless.

UPDATE "skills" SET "is_active" = false
WHERE "service_id" IN (
  SELECT "id" FROM "services" WHERE "slug" IN ('electrical', 'plumbing')
);

INSERT INTO "skills" ("id", "service_id", "slug", "name", "sort_order", "is_active")
SELECT gen_random_uuid(), s."id", v.slug, v.name, v.sort_order, true
FROM (VALUES
  -- Electrical (15)
  ('electrical', 'electrical-socket-switch-installation', 'Electrical socket and switch installation', 1),
  ('electrical', 'electrical-socket-switch-relocation',    'Electrical socket and switch relocation',    2),
  ('electrical', 'electrical-socket-switch-repair',        'Electrical socket and switch repair',        3),
  ('electrical', 'light-fixture-installation',             'Light fixture installation',                 4),
  ('electrical', 'outdoor-lighting-installation',          'Outdoor lighting installation',              5),
  ('electrical', 'electrical-panel-repair',                'Electrical panel repair',                    6),
  ('electrical', 'electrical-panel-replacement',           'Electrical panel replacement or upgrading',  7),
  ('electrical', 'electrical-power-restoration',           'Electrical power restoration',               8),
  ('electrical', 'ev-charger-installation',                'Electric car charger installation',          9),
  ('electrical', 'fan-installation',                       'Fan installation',                          10),
  ('electrical', 'fan-repair',                             'Fan repair',                                11),
  ('electrical', 'ground-wire-installation',               'Ground wire installation',                  12),
  ('electrical', 'light-fixture-repair',                   'Light fixture repair',                      13),
  ('electrical', 'remodelling',                            'Remodelling',                               14),
  ('electrical', 'security-system-installation',           'Security system installation',              15),
  -- Plumbing (19)
  ('plumbing', 'toilet-installation',       'Toilet installation',              1),
  ('plumbing', 'waste-disposal-installation', 'Waste disposal installation',     2),
  ('plumbing', 'tap-repair',                'Tap repair',                        3),
  ('plumbing', 'tap-installation',          'Tap installation',                  4),
  ('plumbing', 'drain-cleaning',            'Drain cleaning',                    5),
  ('plumbing', 'water-heater-installation', 'Water heater installation',         6),
  ('plumbing', 'water-tank-repair',         'Water tank repair',                 7),
  ('plumbing', 'water-tank-installation',   'Water tank installation',           8),
  ('plumbing', 'leak-detection',            'Plumbing leak detection',           9),
  ('plumbing', 'leak-repair',               'Plumbing leak repair',             10),
  ('plumbing', 'pipe-repair',               'Plumbing pipe repair',             11),
  ('plumbing', 'outdoor-plumbing-repair',   'Outdoor plumbing system repair',   12),
  ('plumbing', 'shower-repair',             'Shower repair',                    13),
  ('plumbing', 'shower-installation',       'Shower installation',              14),
  ('plumbing', 'toilet-repair',             'Toilet repair',                    15),
  ('plumbing', 'bathroom-gap-refill',       'Bathroom gap refill',              16),
  ('plumbing', 'draining-line',             'Draining Line',                    17),
  ('plumbing', 'kitchen-waste-line',        'Kitchen waste line',               18),
  ('plumbing', 'wash-area-line',            'Wash area line',                   19)
) AS v(service_slug, slug, name, sort_order)
JOIN "services" s ON s."slug" = v.service_slug
ON CONFLICT ("slug") DO UPDATE SET
  "service_id" = EXCLUDED."service_id",
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
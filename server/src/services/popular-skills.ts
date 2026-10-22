/**
 * The skills promoted on the customer home screen.
 *
 * Curated by hand for now: the order below is the order the rail shows them
 * in, and the first entry is the one the rail flags as the top pick. Only the
 * skill's slug is listed — the parent service comes back with the skill.
 *
 * Service slugs are deliberately not part of the reference. The catalogue has
 * been seeded more than once and the same service has carried more than one
 * slug ("electrical" became "electrician"), so a curated list keyed on the
 * service would silently lose entries from one catalogue to the next. The
 * curated skill slugs below are unique across the catalogue; if that ever
 * stops being true, the resolver keeps the first match in catalogue order and
 * the entry shows up once.
 *
 * A slug the catalogue does not know — renamed, deactivated, removed — is
 * skipped rather than failing the request: the rail shrinks, the home screen
 * still renders.
 */
export const POPULAR_SKILL_SLUGS: string[] = [
  'leak-repair',
  'tap-repair',
  'drain-cleaning',
  'fan-installation',
  'light-fixture-installation',
];

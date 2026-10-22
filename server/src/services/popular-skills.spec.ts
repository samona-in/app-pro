import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POPULAR_SKILL_SLUGS } from './popular-skills';

const BASELINE_MIGRATION = join(
  __dirname,
  '../../prisma/migrations/20261006120000_baseline_rds/migration.sql',
);

interface CatalogueSkill {
  serviceSlug: string;
  skillSlug: string;
  isActive: boolean;
}

/**
 * The services and skills the baseline migration seeds.
 *
 * The catalogue is reference data carried by hand in the migration SQL
 * (CLAUDE.md "API"), so the curated list is checked against it directly
 * rather than against a live database.
 */
function catalogueSkills(): CatalogueSkill[] {
  const sql = readFileSync(BASELINE_MIGRATION, 'utf8');

  const serviceSlugById = new Map<string, string>();
  for (const match of sql.matchAll(
    /INSERT INTO public\.services \([^)]*?\) VALUES \('[^']+', '([^']+)',[^)]*?\);/g,
  )) {
    const [, slug] = match;
    const id = match[0].match(/VALUES \('([^']+)'/)?.[1];
    if (slug && id) serviceSlugById.set(id, slug);
  }

  const skills: CatalogueSkill[] = [];
  for (const match of sql.matchAll(
    /INSERT INTO public\.skills \([^)]*?\) VALUES \('[^']+', '([^']+)', '([^']+)', '[^']+', \d+, (true|false)\);/g,
  )) {
    const [, serviceId, skillSlug, isActive] = match;
    const serviceSlug = serviceSlugById.get(serviceId ?? '');
    if (serviceSlug && skillSlug) {
      skills.push({ serviceSlug, skillSlug, isActive: isActive === 'true' });
    }
  }

  return skills;
}

describe('POPULAR_SKILL_SLUGS', () => {
  it('curates a short list of distinct skills', () => {
    expect(POPULAR_SKILL_SLUGS.length).toBeGreaterThan(0);
    expect(new Set(POPULAR_SKILL_SLUGS).size).toBe(POPULAR_SKILL_SLUGS.length);
  });

  it('only promotes skills the catalogue offers', () => {
    const catalogue = catalogueSkills();

    for (const slug of POPULAR_SKILL_SLUGS) {
      const matches = catalogue.filter((skill) => skill.skillSlug === slug);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((skill) => skill.isActive)).toBe(true);
    }
  });

  it('only promotes skills that belong to a single service', () => {
    const catalogue = catalogueSkills();

    for (const slug of POPULAR_SKILL_SLUGS) {
      const services = new Set(
        catalogue.filter((skill) => skill.skillSlug === slug).map((skill) => skill.serviceSlug),
      );
      expect(services.size).toBe(1);
    }
  });
});

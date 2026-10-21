import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_BANNERS } from '../home-banners';

const CATALOGUE_MIGRATION = join(
  __dirname,
  '../../../../../../server/prisma/migrations/20261006120000_baseline_rds/migration.sql',
);

function catalogueSlugs(): string[] {
  const sql = readFileSync(CATALOGUE_MIGRATION, 'utf8');
  return [...sql.matchAll(/INSERT INTO public\.services .*?'([a-z-]+)', '[^']+'/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('HOME_BANNERS', () => {
  it('promotes the four home promotions', () => {
    expect(HOME_BANNERS.map((banner) => banner.id)).toEqual([
      'home-care',
      'electrical',
      'plumbing',
      'cleaning',
    ]);
  });

  it('gives every banner a heading, a subtitle and a call to action', () => {
    for (const banner of HOME_BANNERS) {
      expect(banner.heading.length).toBeGreaterThan(0);
      expect(banner.subtitle.length).toBeGreaterThan(0);
      expect(banner.ctaLabel.length).toBeGreaterThan(0);
      expect(banner.imageDescription.length).toBeGreaterThan(0);
    }
  });

  it('keeps ids and call to actions unique', () => {
    expect(new Set(HOME_BANNERS.map((banner) => banner.id)).size).toBe(HOME_BANNERS.length);
    expect(new Set(HOME_BANNERS.map((banner) => banner.ctaLabel)).size).toBe(HOME_BANNERS.length);
  });

  it('only promotes services that exist in the catalogue', () => {
    const slugs = catalogueSlugs();
    const promoted = HOME_BANNERS.flatMap((banner) =>
      banner.serviceSlug ? [banner.serviceSlug] : [],
    );

    expect(promoted.length).toBeGreaterThan(0);
    for (const slug of promoted) {
      expect(slugs).toContain(slug);
    }
  });

  it('marks the general banner with no service', () => {
    expect(HOME_BANNERS.filter((banner) => banner.serviceSlug === null)).toHaveLength(1);
  });
});

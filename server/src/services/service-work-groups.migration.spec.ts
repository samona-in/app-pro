import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../prisma/migrations/20261102000000_add_service_work_groups/migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('service work groups database migration', () => {
  it('prevents duplicate group slugs within a service and indexes the service lookup', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "service_work_groups_service_id_slug_key" ON "service_work_groups"("service_id", "slug")',
    );
    expect(migration).toContain(
      'CREATE INDEX "service_work_groups_service_id_idx" ON "service_work_groups"("service_id")',
    );
  });

  it('keeps work ids intact and clears an optional group link if a group is removed', () => {
    expect(migration).toContain('ALTER TABLE "skills" ADD COLUMN "group_id" UUID');
    expect(migration).toContain(
      'FOREIGN KEY ("group_id") REFERENCES "service_work_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });
});

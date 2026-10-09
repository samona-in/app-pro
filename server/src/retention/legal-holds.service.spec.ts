import { createLegalHoldService } from './legal-holds.service';
import type { PrismaClient } from '../database/prisma';

function fakePrisma(rows: Array<{ holderId: string; holderType: string }>) {
  const prisma = {
    legalHold: {
      findMany: jest.fn(async () => rows.map((row) => ({ holderId: row.holderId }))),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // The profile check filters to PROFILE/PRO_PROFILE; count rows matching.
        const and = where.AND as Array<{ OR: Array<Record<string, unknown>> }> | undefined;
        if (and) {
          const holderIds = and[0]!.OR.map((o) => o.holderId as string);
          return rows.filter((r) => holderIds.includes(r.holderId)).length;
        }
        const holderId = where.holderId as string | undefined;
        const inIds = (where.holderType as { in?: string[] } | undefined)?.in;
        return rows.filter(
          (r) =>
            (holderId ? r.holderId === holderId : true) &&
            (inIds ? inIds.includes(r.holderType) : true),
        ).length;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new',
        ...data,
      })),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
          id: where.id,
          ...data,
        }),
      ),
    },
  };
  return prisma as unknown as PrismaClient & typeof prisma;
}

describe('legal hold service', () => {
  it('returns the de-duplicated live holder ids', async () => {
    const prisma = fakePrisma([
      { holderId: 'a', holderType: 'DOCUMENT' },
      { holderId: 'a', holderType: 'DOCUMENT' },
      { holderId: 'b', holderType: 'DOCUMENT' },
    ]);
    const service = createLegalHoldService({ prisma });

    await expect(service.listActiveHolderIds('DOCUMENT')).resolves.toEqual(['a', 'b']);
    expect(prisma.legalHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: true }) }),
    );
  });

  it('detects a live hold for a profile across PROFILE and PRO_PROFILE', async () => {
    const prisma = fakePrisma([{ holderId: 'user-1', holderType: 'PROFILE' }]);
    const service = createLegalHoldService({ prisma });

    await expect(service.hasAnyActiveHoldForProfile('user-1')).resolves.toBe(true);
    await expect(service.hasAnyActiveHoldForProfile('user-2')).resolves.toBe(false);
  });

  it('creates an active hold and releases it by id', async () => {
    const prisma = fakePrisma([]);
    const service = createLegalHoldService({ prisma });

    const created = await service.createHold({
      holderType: 'DOCUMENT',
      holderId: 'doc-1',
      reason: 'litigation',
      authorizedBy: 'admin-1',
    });
    expect(created).toMatchObject({ active: true, holderId: 'doc-1', expiresAt: null });

    await service.releaseHold('hold-1', 'admin-1');
    expect(prisma.legalHold.update).toHaveBeenCalledWith({
      where: { id: 'hold-1' },
      data: expect.objectContaining({ active: false, releasedBy: 'admin-1' }),
    });
  });
});

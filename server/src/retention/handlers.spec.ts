import { createRetentionHandlers, type HandlerArgs, type OrphanScanner } from './handlers';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { LegalHoldService } from './legal-holds.service';

const CUTOFF = new Date('2025-01-01T00:00:00.000Z');

function args(overrides: Partial<HandlerArgs> = {}): HandlerArgs {
  return {
    cutoff: CUTOFF,
    dryRun: true,
    canDelete: false,
    sampleLimit: 25,
    maxScan: 100,
    ...overrides,
  };
}

function makeDeps() {
  const prisma = {
    proDocument: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    proProfile: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    message: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaClient;

  const storage = {
    documentsBucket: 'documents',
    selfiesBucket: 'selfies',
    avatarsBucket: 'avatars',
    jobImagesBucket: 'job-images',
    deleteObject: jest.fn().mockResolvedValue(undefined),
    deleteObjects: jest.fn().mockResolvedValue(undefined),
    listObjects: jest.fn().mockResolvedValue({ objects: [], nextToken: null }),
  } as unknown as StorageService;

  const legalHolds = {
    listActiveHolderIds: jest.fn().mockResolvedValue([]),
  } as unknown as LegalHoldService;

  const orphan = { scanJobImages: jest.fn() } as unknown as OrphanScanner;

  return { prisma, storage, legalHolds, orphan };
}

function handlersFor(deps: ReturnType<typeof makeDeps>) {
  return createRetentionHandlers({ ...deps, safetyWindowDays: 7 }).handlers;
}

describe('retention handlers — retention anchors', () => {
  it('proDocuments anchors on profile deletion, not document age', async () => {
    const deps = makeDeps();
    await handlersFor(deps).proDocuments(args());

    const where = (deps.prisma.proDocument.count as jest.Mock).mock.calls[0][0].where;
    expect(where.proProfile.deletedAt).toEqual({ not: null, lt: CUTOFF });
    expect(where.createdAt).toBeUndefined();
  });

  it('selfies anchors on profile deletion, not capture date', async () => {
    const deps = makeDeps();
    await handlersFor(deps).selfies(args());

    const where = (deps.prisma.proProfile.count as jest.Mock).mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ not: null, lt: CUTOFF });
    expect(where.selfieCapturedAt).toBeUndefined();
  });
});

describe('retention handlers — invariants', () => {
  it('proDocuments deletes the S3 object before dropping the naming row', async () => {
    const deps = makeDeps();
    (deps.prisma.proDocument.count as jest.Mock).mockResolvedValue(1);
    (deps.prisma.proDocument.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'doc-1', storagePath: 'pros/u1/id.pdf', createdAt: CUTOFF }])
      .mockResolvedValueOnce([{ id: 'doc-1', storagePath: 'pros/u1/id.pdf' }]);
    (deps.prisma.proDocument.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await handlersFor(deps).proDocuments(args({ canDelete: true, dryRun: false }));

    expect(result.deletedCount).toBe(1);
    const storageOrder = (deps.storage.deleteObject as jest.Mock).mock.invocationCallOrder[0]!;
    const dbOrder = (deps.prisma.proDocument.deleteMany as jest.Mock).mock.invocationCallOrder[0]!;
    expect(storageOrder).toBeLessThan(dbOrder);
  });

  it('a report-only handler never deletes, even when told it may', async () => {
    const deps = makeDeps();
    await handlersFor(deps).messages(args({ canDelete: true, dryRun: false }));

    expect(deps.prisma.message.deleteMany).not.toHaveBeenCalled();
  });
});

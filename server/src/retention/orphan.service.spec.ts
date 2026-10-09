import { createOrphanService } from './orphan.service';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';

const NOW = new Date('2026-06-01T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const CUTOFF_MS = NOW.getTime() - 7 * DAY_MS;

function oldDate(): Date {
  return new Date(NOW.getTime() - 30 * DAY_MS);
}

function freshDate(): Date {
  return new Date(NOW.getTime() - DAY_MS);
}

function fakePrisma(jobs: Array<{ id: string; imagePaths: string[] }>) {
  const prisma = {
    job: {
      findMany: jest.fn(async (args: { cursor?: { id: string }; skip?: number }) =>
        args.cursor ? [] : jobs.map((job) => ({ id: job.id, imagePaths: job.imagePaths })),
      ),
    },
  };
  return prisma as unknown as PrismaClient & typeof prisma;
}

function fakeStorage(pages: Array<Array<{ key: string; lastModified: Date }>>) {
  let call = 0;
  const storage = {
    jobImagesBucket: 'job-images',
    listObjects: jest.fn(async () => {
      const objects = pages[call] ?? [];
      call += 1;
      return {
        objects: objects.map((o) => ({ ...o, size: 1 })),
        nextToken: call < pages.length ? `page-${call}` : null,
      };
    }),
    deleteObjects: jest.fn(async () => undefined),
  };
  return storage as unknown as StorageService & typeof storage;
}

function build(
  jobs: Array<{ id: string; imagePaths: string[] }>,
  storage: ReturnType<typeof fakeStorage>,
) {
  return createOrphanService({
    prisma: fakePrisma(jobs),
    storage,
    safetyWindowDays: 7,
    now: () => NOW,
  });
}

describe('orphan job-image scanner', () => {
  it('finds only objects no job references and older than the window', async () => {
    const storage = fakeStorage([
      [
        { key: 'jobs/c1/keep.jpg', lastModified: oldDate() },
        { key: 'jobs/c1/orphan.jpg', lastModified: oldDate() },
        { key: 'jobs/c1/fresh.jpg', lastModified: freshDate() },
      ],
    ]);
    const orphan = build([{ id: 'j1', imagePaths: ['jobs/c1/keep.jpg'] }], storage);

    const report = await orphan.scanJobImages({
      cutoffMs: CUTOFF_MS,
      dryRun: true,
      sampleLimit: 25,
      maxScan: 1000,
    });

    expect(report.orphanCount).toBe(1);
    expect(report.sampleKeys).toEqual(['jobs/c1/orphan.jpg']);
    expect(report.deletedCount).toBe(0);
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('deletes the orphans when not a dry-run', async () => {
    const storage = fakeStorage([[{ key: 'jobs/c1/orphan.jpg', lastModified: oldDate() }]]);
    const orphan = build([], storage);

    const report = await orphan.scanJobImages({
      cutoffMs: CUTOFF_MS,
      dryRun: false,
      sampleLimit: 25,
      maxScan: 1000,
    });

    expect(report.deletedCount).toBe(1);
    expect(storage.deleteObjects).toHaveBeenCalledWith('job-images', ['jobs/c1/orphan.jpg']);
  });

  it('spares a path that a job claims between the scan and the delete', async () => {
    const storage = fakeStorage([[{ key: 'jobs/c1/racy.jpg', lastModified: oldDate() }]]);
    const prisma = fakePrisma([]);
    // First reference read: nothing. Second (the safety re-check): the job now
    // names the path, so it must not be removed.
    prisma.job.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'j1', imagePaths: ['jobs/c1/racy.jpg'] }] as never);
    const orphan = createOrphanService({
      prisma,
      storage,
      safetyWindowDays: 7,
      now: () => NOW,
    });

    const report = await orphan.scanJobImages({
      cutoffMs: CUTOFF_MS,
      dryRun: false,
      sampleLimit: 25,
      maxScan: 1000,
    });

    expect(report.orphanCount).toBe(0);
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('follows pagination across pages', async () => {
    const storage = fakeStorage([
      [{ key: 'jobs/c1/a.jpg', lastModified: oldDate() }],
      [{ key: 'jobs/c1/b.jpg', lastModified: oldDate() }],
    ]);
    const orphan = build([], storage);

    const report = await orphan.scanJobImages({
      cutoffMs: CUTOFF_MS,
      dryRun: true,
      sampleLimit: 25,
      maxScan: 1000,
    });

    expect(report.scannedCount).toBe(2);
    expect(report.orphanCount).toBe(2);
    expect(storage.listObjects).toHaveBeenCalledTimes(2);
  });
});

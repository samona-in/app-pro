import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { OrphanScanReport } from './types';
import { logger } from '../common/logger';

const JOB_IMAGE_PREFIX = 'jobs/';
const REFERENCE_PAGE_SIZE = 500;

export interface OrphanServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  safetyWindowDays: number;
  now?: () => Date;
}

/**
 * Finds and (when allowed) removes job-image objects no job references.
 *
 * Job images are the customer's record of a booking, so this is deliberately
 * conservative:
 *
 * - An object is a candidate only when **no** job's `imagePaths` names it and
 *   it is older than the safety window, which gives a job created around the
 *   same time time to commit its reference.
 * - The reference set is rebuilt immediately before deletion (the "second
 *   check"), so a path claimed between the scan and the delete is spared.
 * - A failed batch delete throws, leaving the category for the next sweep
 *   rather than reporting a partial purge as done.
 */
export function createOrphanService(deps: OrphanServiceDeps) {
  const now = (): Date => deps.now?.() ?? new Date();

  /**
   * Every path any job currently references.
   *
   * Walked with a keyset cursor rather than loading every job at once, so a
   * large job table does not have to fit in memory.
   */
  async function referencedJobImagePaths(): Promise<Set<string>> {
    const referenced = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const jobs = await deps.prisma.job.findMany({
        where: { imagePaths: { isEmpty: false } },
        select: { id: true, imagePaths: true },
        orderBy: { id: 'asc' },
        take: REFERENCE_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (jobs.length === 0) break;
      for (const job of jobs) {
        for (const path of job.imagePaths) referenced.add(path);
      }
      const last = jobs[jobs.length - 1];
      if (!last || jobs.length < REFERENCE_PAGE_SIZE) break;
      cursor = last.id;
    }
    return referenced;
  }

  async function scanJobImages(args: {
    cutoffMs: number;
    dryRun: boolean;
    sampleLimit: number;
    maxScan: number;
  }): Promise<OrphanScanReport> {
    const referenced = await referencedJobImagePaths();

    const objects: Array<{ key: string; lastModified: Date | null }> = [];
    let token: string | null = null;
    let scannedCount = 0;
    do {
      const page = await deps.storage.listObjects(deps.storage.jobImagesBucket, JOB_IMAGE_PREFIX, {
        continuationToken: token ?? undefined,
      });
      for (const object of page.objects) {
        objects.push({ key: object.key, lastModified: object.lastModified });
      }
      scannedCount += page.objects.length;
      token = page.nextToken;
      if (scannedCount >= args.maxScan) break;
    } while (token);

    const candidates = objects.filter(
      (object) =>
        !referenced.has(object.key) &&
        object.lastModified !== null &&
        object.lastModified.getTime() < args.cutoffMs,
    );

    // Second reference check: a job may have committed to one of these paths
    // since the set was built. Rebuild and drop anything now referenced.
    let orphanKeys = candidates.map((object) => object.key);
    if (orphanKeys.length > 0) {
      const latest = await referencedJobImagePaths();
      orphanKeys = orphanKeys.filter((key) => !latest.has(key));
    }

    let deletedCount = 0;
    if (!args.dryRun && orphanKeys.length > 0) {
      await deps.storage.deleteObjects(deps.storage.jobImagesBucket, orphanKeys);
      deletedCount = orphanKeys.length;
      logger.info('Removed orphaned job-image objects', { count: deletedCount });
    }

    return {
      bucket: deps.storage.jobImagesBucket,
      prefix: JOB_IMAGE_PREFIX,
      scannedCount,
      referencedCount: referenced.size,
      orphanCount: orphanKeys.length,
      sampleKeys: orphanKeys.slice(0, args.sampleLimit),
      secondCheckPassed: true,
      deletedCount,
    };
  }

  return { scanJobImages, referencedJobImagePaths, now };
}

export type OrphanService = ReturnType<typeof createOrphanService>;

import { JobStatus, OTHER_SKILL_SLUG, type Job } from '@samona/types';
import type { CreateJobInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import { badRequest, notFound } from '../common/errors';

export interface JobsServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
}

/** The customer scoped folder every job image is minted under. */
function jobImageScope(customerUserId: string): string {
  return `jobs/${customerUserId}/`;
}

/** Prisma projection shared by every job read. */
const jobInclude = {
  service: { select: { id: true, slug: true, name: true, icon: true } },
  skill: { select: { id: true, slug: true, name: true } },
} as const;

function toJobDto(
  row: {
    id: string;
    customerId: string;
    proId: string | null;
    status: JobStatus;
    placeType: Job['placeType'];
    placeDescription: string | null;
    description: string;
    imagePaths: string[];
    basePayPaise: number;
    agreedPayPaise: number | null;
    finalPayPaise: number | null;
    createdAt: Date;
    updatedAt: Date;
    service: Job['service'];
    skill: Job['skill'];
    customSkill: string | null;
  },
  storage: StorageService,
): Job {
  return {
    id: row.id,
    customerId: row.customerId,
    proId: row.proId,
    service: row.service,
    skill: row.skill,
    customSkill: row.customSkill,
    status: row.status,
    placeType: row.placeType,
    placeDescription: row.placeDescription,
    description: row.description,
    imageUrls: row.imagePaths.map((path) => storage.jobImagePublicUrl(path)),
    basePayPaise: row.basePayPaise,
    agreedPayPaise: row.agreedPayPaise,
    finalPayPaise: row.finalPayPaise,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Jobs domain service.
 *
 * The job lifecycle and its state machine. Every transition is validated here
 * against JOB_STATUS_TRANSITIONS before it is written, and each change is
 * recorded in JobStatusHistory. All reads are scoped to the caller's own
 * profile — the user id comes from the verified token, never from the client.
 */
export function createJobsService(deps: JobsServiceDeps) {
  const { prisma, storage } = deps;

  /**
   * Places a job request (the customer booking flow's final step).
   *
   * The service and skill are resolved from slugs server-side so nothing
   * id-based from the client is trusted, and the skill is confirmed to belong
   * to the chosen service. Reference photos are verified to have actually
   * reached storage and to live under the caller's own scope before a single
   * path is recorded.
   */
  async function createForCustomer(customerUserId: string, input: CreateJobInput): Promise<Job> {
    const customer = await prisma.customerProfile.findUnique({ where: { userId: customerUserId } });
    if (!customer) {
      throw notFound('Your profile is not ready yet. Try again in a moment.');
    }

    const service = await prisma.service.findFirst({
      where: { slug: input.serviceSlug, isActive: true },
      select: { id: true },
    });
    if (!service) {
      throw badRequest('That service is no longer bookable.');
    }

    const skill = await prisma.skill.findFirst({
      where: { slug: input.skillSlug, serviceId: service.id, isActive: true },
      select: { id: true },
    });
    if (!skill) {
      throw badRequest('That job category does not belong to the chosen service.');
    }

    // The `other` category carries the customer's own words; a predefined
    // category must not. Mirrors the placeDescription/placeType pairing above
    // so a mismatch cannot slip through (validation already blocks it, this
    // keeps the domain safe even if a different caller ever reaches it).
    const customSkill = input.customSkill ?? null;
    if (input.skillSlug === OTHER_SKILL_SLUG && !customSkill) {
      throw badRequest('Tell us what you need done.');
    }
    if (input.skillSlug !== OTHER_SKILL_SLUG && customSkill) {
      throw badRequest('Only the "Other" category takes a custom skill.');
    }

    // Reference photos: every submitted path must be scoped to this caller and
    // must point at an object that really reached storage. Without the scope
    // check a customer could reference another account's photos; without the
    // existence check a job could point at nothing at all.
    const scoped = input.imagePaths.every((path) => path.startsWith(jobImageScope(customerUserId)));
    if (!scoped) {
      throw badRequest('One of the photos is not valid.');
    }
    const uploaded = await Promise.all(
      input.imagePaths.map((path) => storage.jobImageExists(path)),
    );
    if (uploaded.some((exists) => !exists)) {
      throw badRequest('One of the photos did not finish uploading. Try again.');
    }

    const created = await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          skillId: skill.id,
          customSkill,
          status: JobStatus.REQUESTED,
          placeType: input.placeType,
          placeDescription: input.placeType === 'OTHER' ? (input.placeDescription ?? null) : null,
          description: input.description,
          imagePaths: input.imagePaths,
          basePayPaise: input.basePayPaise,
        },
        include: jobInclude,
      });

      await tx.jobStatusHistory.create({
        data: { jobId: job.id, fromStatus: null, toStatus: JobStatus.REQUESTED },
      });

      return job;
    });

    return toJobDto(created, storage);
  }

  /**
   * The caller's own requests, newest first.
   *
   * A bounded recent list; full cursor pagination lands with the bookings feed
   * that needs it.
   */
  async function listForCustomer(customerUserId: string, limit: number): Promise<Job[]> {
    const customer = await prisma.customerProfile.findUnique({ where: { userId: customerUserId } });
    if (!customer) return [];

    const rows = await prisma.job.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 50)),
      include: jobInclude,
    });

    return rows.map((row) => toJobDto(row as never, storage));
  }

  /**
   * One of the caller's requests, or a 404 that hides whether the job exists
   * at all (no id-or_user probing).
   */
  async function getForCustomer(customerUserId: string, jobId: string): Promise<Job> {
    const row = await prisma.job.findFirst({
      where: { id: jobId, customer: { userId: customerUserId } },
      include: jobInclude,
    });

    if (!row) throw notFound('That booking could not be found.');

    return toJobDto(row as never, storage);
  }

  return { createForCustomer, listForCustomer, getForCustomer };
}

export type JobsService = ReturnType<typeof createJobsService>;

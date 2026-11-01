import { Router } from 'express';
import type { AdminJobListQuery } from '@samona/validation';
import { adminJobListQuerySchema, idSchema, z } from '@samona/validation';
import type { PrismaClient } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import type { StorageService } from '../../files/storage.service';
import { badRequest, notFound, routeParamId, validate } from '../../common';
import {
  buildJobSearchCondition,
  customerName,
  iso,
  jobBaseSelect,
  jobListSelect,
  proName,
  toJobListDto,
} from './admin-jobs.shared';

export interface AdminJobsDeps {
  prisma: PrismaClient | null;
  storage: StorageService;
}

/**
 * Admin bookings ledger — the read-only record of every job.
 *
 * Unlike `/jobs`, which only ever returns the caller's own work, these routes
 * are cross-account and admin-only. They are mounted behind `requireAdmin` by
 * `createAdminRouter`; nothing here trusts a client-supplied identity.
 *
 * Two deliberate omissions:
 * - `verificationOtp` is never selected. Only the customer may see the start
 *   code, so an admin response cannot leak it.
 * - `JobOffer.tokenHash` / `deviceId` are never selected. The offer ledger is
 *   shown for support context, not as a credential.
 *
 * Pagination is cursor-based on `(createdAt, id)` rather than offset: jobs are
 * written continuously, and an offset page would skip rows between requests.
 */
export function createAdminJobsRouter({ prisma: client, storage }: AdminJobsDeps): Router {
  const router = Router();

  router.get('/', validate(adminJobListQuerySchema, 'query'), async (req, res, next) => {
    try {
      if (!client) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const query = req.query as unknown as AdminJobListQuery;

      const where: Prisma.JobWhereInput = {};
      if (query.status?.length) where.status = { in: query.status };
      if (query.serviceId) where.serviceId = query.serviceId;
      if (query.proId) where.proId = query.proId;
      if (query.customerId) where.customerId = query.customerId;
      if (query.from || query.to) {
        where.createdAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }

      const conditions: Prisma.JobWhereInput[] = [];
      const search = query.q ? await buildJobSearchCondition(client, query.q) : null;
      if (search) conditions.push(search);
      if (query.cursor) conditions.push(cursorCondition(decodeCursor(query.cursor)));
      if (conditions.length) where.AND = conditions;

      const rows = await client.job.findMany({
        where,
        select: jobListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });

      const page = rows.slice(0, query.limit);
      const last = page[page.length - 1];

      res.json({
        data: page.map(toJobListDto),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', validate(z.object({ id: idSchema }), 'params'), async (req, res, next) => {
    try {
      if (!client) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const job = await client.job.findUnique({
        where: { id: routeParamId(req.params.id) },
        select: detailSelect,
      });

      if (!job) throw notFound('Job not found.');

      res.json({ data: toDetailDto(job, storage) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const detailSelect = {
  ...jobBaseSelect,
  description: true,
  imagePaths: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
  startOtpAttempts: true,
  customer: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      locationLabel: true,
      latitude: true,
      longitude: true,
      deletedAt: true,
      profile: { select: { id: true, fullName: true, phone: true, isActive: true } },
    },
  },
  pro: {
    select: {
      id: true,
      displayName: true,
      isOnline: true,
      isVerified: true,
      rating: true,
      completedJobs: true,
      locationLabel: true,
      latitude: true,
      longitude: true,
      deletedAt: true,
      profile: { select: { id: true, fullName: true, phone: true } },
    },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      changedById: true,
      createdAt: true,
    },
  },
  jobOffers: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      proId: true,
      expiresAt: true,
      consumedAt: true,
      outcome: true,
      createdAt: true,
    },
  },
  declines: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, proId: true, createdAt: true },
  },
} satisfies Prisma.JobSelect;

type DetailJob = Prisma.JobGetPayload<{ select: typeof detailSelect }>;

function toDetailDto(job: DetailJob, storage: StorageService) {
  const customerDeleted = Boolean(job.customer.deletedAt);
  const proDeleted = Boolean(job.pro?.deletedAt);

  return {
    ...toJobListDto(job),
    updatedAt: job.updatedAt.toISOString(),
    customSkill: job.customSkill,
    description: job.description,
    imageUrls: job.imagePaths.map((path) => storage.jobImagePublicUrl(path)),
    latitude: job.latitude,
    longitude: job.longitude,
    // Deliberately masked: the start code belongs to the customer alone.
    verificationOtp: null,
    startOtpAttempts: job.startOtpAttempts,
    customer: {
      id: job.customer.id,
      displayName: customerDeleted ? null : customerName(job.customer),
      avatarUrl: customerDeleted ? null : job.customer.avatarUrl,
      locationLabel: customerDeleted ? null : job.customer.locationLabel,
      latitude: customerDeleted ? null : job.customer.latitude,
      longitude: customerDeleted ? null : job.customer.longitude,
      profile: {
        fullName: customerDeleted ? null : (job.customer.profile?.fullName ?? null),
        phone: customerDeleted ? null : (job.customer.profile?.phone ?? null),
        isActive: job.customer.profile?.isActive ?? false,
      },
    },
    pro: job.pro
      ? {
          id: job.pro.id,
          displayName: proDeleted ? null : proName(job.pro),
          isOnline: job.pro.isOnline,
          isVerified: job.pro.isVerified,
          rating: job.pro.rating,
          completedJobs: job.pro.completedJobs,
          locationLabel: proDeleted ? null : job.pro.locationLabel,
          latitude: proDeleted ? null : job.pro.latitude,
          longitude: proDeleted ? null : job.pro.longitude,
          profile: {
            fullName: proDeleted ? null : (job.pro.profile?.fullName ?? null),
            phone: proDeleted ? null : (job.pro.profile?.phone ?? null),
          },
        }
      : null,
    statusHistory: job.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedBy: toStatusActor(entry.changedById, job),
      createdAt: entry.createdAt.toISOString(),
    })),
    offers: job.jobOffers.map((offer) => ({
      id: offer.id,
      proId: offer.proId,
      expiresAt: offer.expiresAt.toISOString(),
      consumedAt: iso(offer.consumedAt),
      outcome: offer.outcome,
      createdAt: offer.createdAt.toISOString(),
    })),
    declines: job.declines.map((decline) => ({
      id: decline.id,
      proId: decline.proId,
      createdAt: decline.createdAt.toISOString(),
    })),
  };
}

type StatusActorRole = 'PRO' | 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';

interface StatusActorDto {
  /**
   * The actor's surface id — `ProProfile.id` or `CustomerProfile.id`, the same
   * id already exposed on the booking. Never the internal Profile/user id.
   * Null for system and support actions, which have no dashboard page.
   */
  id: string | null;
  name: string | null;
  role: StatusActorRole;
}

/**
 * Names the person behind a status change instead of shipping a bare uuid.
 *
 * `changedById` is a Profile id: the pro's or customer's own user id (see
 * `ProProfile.userId` / `CustomerProfile.userId`), so both parties can be
 * resolved from the job itself. Anything else is an internal (admin) action.
 * Tombstoned accounts stay unnamed, matching how their PII is withheld
 * elsewhere in this response.
 */
function toStatusActor(changedById: string | null, job: DetailJob): StatusActorDto {
  if (!changedById) return { id: null, name: null, role: 'SYSTEM' };

  if (job.pro?.profile?.id === changedById) {
    return {
      id: job.pro.id,
      name: job.pro.deletedAt ? null : proName(job.pro),
      role: 'PRO',
    };
  }

  if (job.customer.profile?.id === changedById) {
    return {
      id: job.customer.id,
      name: job.customer.deletedAt ? null : customerName(job.customer),
      role: 'CUSTOMER',
    };
  }

  return { id: null, name: null, role: 'SUPPORT' };
}

interface JobCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(raw: string): JobCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof parsed.createdAt === 'string' &&
      typeof parsed.id === 'string' &&
      idSchema.safeParse(parsed.id).success &&
      !Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // Fall through to the single error below.
  }
  throw badRequest('Invalid cursor.');
}

function cursorCondition(cursor: JobCursor): Prisma.JobWhereInput {
  return {
    OR: [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
    ],
  };
}

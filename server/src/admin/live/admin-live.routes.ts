import { Router } from 'express';
import type { AdminLiveQuery } from '@samona/validation';
import { adminLiveQuerySchema } from '@samona/validation';
import type { PrismaClient } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { validate } from '../../common';
import {
  buildJobSearchCondition,
  jobListSelect,
  toJobListDto,
  type JobListRow,
} from '../jobs/admin-jobs.shared';

/**
 * The operations time zone for "today". SAMONA operates in India, and IST has
 * a fixed +05:30 offset (no DST), so a calendar day is always 24 hours.
 */
export const LIVE_TIME_ZONE = 'Asia/Kolkata';

const IST_OFFSET = '+05:30';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A hard ceiling on the live snapshot. The board is meant to answer "what is
 * happening today" at a glance, not to page through thousands of rows; the
 * response reports `truncated` when this cap is hit.
 */
const LIVE_LIMIT = 200;

/**
 * Still-open work: everything before a terminal state. An expired offer or a
 * cancelled visit is history, not operations.
 */
const LIVE_JOB_STATUSES = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'TRAVELLING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_PENDING',
] as const;

/** Requests an operator should chase: still unassigned and past their expiry. */
const OVERDUE_STATUSES = ['REQUESTED', 'OFFERED'] as const;

export interface AdminLiveDeps {
  prisma: PrismaClient | null;
  /** Injectable clock so "today" stays testable. */
  now?: () => Date;
}

/**
 * Midnight-to-midnight bounds for the current day in `LIVE_TIME_ZONE`.
 *
 * Built from the zone's calendar date rather than the server's, so a host in
 * UTC does not roll the board over at 05:30 IST.
 */
export function liveDayBounds(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIVE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '';

  const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00${IST_OFFSET}`);

  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function liveOrderBy(sort: AdminLiveQuery['sort']): Prisma.JobOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'amount_desc':
      return [{ basePayPaise: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
    case 'expiring':
      // Rows with no expiry sink to the bottom.
      return [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

/**
 * Live operations — today's still-open jobs, at a glance.
 *
 * Unlike `/admin/jobs` (the historical ledger), this is a single unpaginated
 * snapshot pinned to the current day in `LIVE_TIME_ZONE`, with counts the
 * dashboard can render without walking the rows. Safe to poll: the query is
 * bounded and only ever touches today's window.
 */
export function createAdminLiveRouter({ prisma: client, now = () => new Date() }: AdminLiveDeps) {
  const router = Router();

  router.get('/', validate(adminLiveQuerySchema, 'query'), async (req, res, next) => {
    try {
      if (!client) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const query = req.query as unknown as AdminLiveQuery;
      const generatedAt = now();
      const { start, end } = liveDayBounds(generatedAt);

      const conditions: Prisma.JobWhereInput[] = [
        { createdAt: { gte: start, lt: end } },
        { status: { in: query.status?.length ? query.status : [...LIVE_JOB_STATUSES] } },
      ];

      if (query.q) {
        const search = await buildJobSearchCondition(client, query.q);
        if (search) conditions.push(search);
      }

      const where: Prisma.JobWhereInput = { AND: conditions };

      const [rows, grouped, overdue] = await Promise.all([
        client.job.findMany({
          where,
          select: jobListSelect,
          orderBy: liveOrderBy(query.sort),
          take: LIVE_LIMIT + 1,
        }),
        client.job.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        client.job.count({
          where: {
            AND: [
              ...conditions,
              { status: { in: [...OVERDUE_STATUSES] } },
              { expiresAt: { lt: generatedAt } },
            ],
          },
        }),
      ]);

      const counts = new Map<string, number>(
        grouped.map((group) => [group.status as string, group._count._all]),
      );
      const countOf = (...statuses: string[]): number =>
        statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

      const total = grouped.reduce((sum, group) => sum + group._count._all, 0);
      const page: JobListRow[] = rows.slice(0, LIVE_LIMIT);

      res.json({
        data: page.map(toJobListDto),
        summary: {
          total,
          waitingForPro: countOf('REQUESTED', 'OFFERED'),
          enRoute: countOf('TRAVELLING'),
          inProgress: countOf('ACCEPTED', 'ARRIVED', 'IN_PROGRESS'),
          paymentPending: countOf('COMPLETED', 'PAYMENT_PENDING'),
          overdue,
        },
        day: {
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone: LIVE_TIME_ZONE,
        },
        generatedAt: generatedAt.toISOString(),
        truncated: rows.length > LIVE_LIMIT,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

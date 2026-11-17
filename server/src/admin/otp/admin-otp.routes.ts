import { Router } from 'express';
import { z } from '@samona/validation';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaClient } from '../../database/prisma';
import { badRequest, notFound, routeParamId, validate } from '../../common';

/**
 * Read-only admin view of phone-OTP delivery telemetry.
 *
 * Mounted behind `createRequireAdmin` by `createAdminRouter`. These routes are
 * diagnostic only: they cannot resend a code, reveal an OTP, or change an auth
 * decision. The response deliberately omits `phoneHash` and every full phone
 * number — `phoneLast2` is enough for a support agent to confirm a ticket, and
 * the hash has no meaning outside a raw SQL join.
 *
 * Pagination is a cursor over `(requestedAt, id)` because attempts are written
 * continuously; an offset page would skip rows while someone reads the list.
 */
export interface AdminOtpDeps {
  prisma: PrismaClient | null;
}

const DELIVERY_STATUSES = ['SENT', 'DELIVERED', 'READ', 'UNDELIVERED', 'FAILED'] as const;

const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    app: z.enum(['CUSTOMER', 'PRO']).optional(),
    status: z.enum(DELIVERY_STATUSES).optional(),
    device: z.string().trim().min(1).max(64).optional(),
    phoneLast2: z
      .string()
      .regex(/^\d{2}$/, 'Enter exactly two digits.')
      .optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.to).getTime() > new Date(value.from).getTime(),
    { message: '`to` must be after `from`.', path: ['to'] },
  );

type ListQuery = z.infer<typeof listQuerySchema>;

const listSelect = {
  id: true,
  requestedAt: true,
  app: true,
  phoneLast2: true,
  deviceManufacturer: true,
  deviceModel: true,
  osVersion: true,
  status: true,
  verificationSid: true,
  attemptSid: true,
  lastEventAt: true,
  _count: { select: { deliveryEvents: true } },
} satisfies Prisma.OtpAttemptSelect;

const detailSelect = {
  ...listSelect,
  deliveryEvents: {
    orderBy: [{ eventTime: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      eventType: true,
      status: true,
      verificationSid: true,
      attemptSid: true,
      channel: true,
      mcc: true,
      mnc: true,
      numberSegments: true,
      eventTime: true,
      receivedAt: true,
    },
  },
} satisfies Prisma.OtpAttemptSelect;

type ListRow = Prisma.OtpAttemptGetPayload<{ select: typeof listSelect }>;
type DetailRow = Prisma.OtpAttemptGetPayload<{ select: typeof detailSelect }>;

interface AttemptCursor {
  requestedAt: string;
  id: string;
}

function encodeCursor(row: { requestedAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ requestedAt: row.requestedAt.toISOString(), id: row.id }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(raw: string): AttemptCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      'requestedAt' in parsed &&
      'id' in parsed &&
      typeof parsed.requestedAt === 'string' &&
      typeof parsed.id === 'string' &&
      z.uuid().safeParse(parsed.id).success &&
      !Number.isNaN(Date.parse(parsed.requestedAt))
    ) {
      return { requestedAt: parsed.requestedAt, id: parsed.id };
    }
  } catch {
    // Fall through to the single error below.
  }
  throw badRequest('Invalid cursor.');
}

function cursorCondition(cursor: AttemptCursor): Prisma.OtpAttemptWhereInput {
  const requestedAt = new Date(cursor.requestedAt);
  return {
    OR: [{ requestedAt: { lt: requestedAt } }, { requestedAt, id: { lt: cursor.id } }],
  };
}

function toListDto(row: ListRow) {
  return {
    id: row.id,
    requestedAt: row.requestedAt.toISOString(),
    app: row.app,
    phoneLast2: row.phoneLast2,
    deviceManufacturer: row.deviceManufacturer,
    deviceModel: row.deviceModel,
    osVersion: row.osVersion,
    status: row.status,
    verificationSid: row.verificationSid,
    attemptSid: row.attemptSid,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    eventCount: row._count.deliveryEvents,
  };
}

function toDetailDto(row: DetailRow) {
  return {
    ...toListDto(row),
    deliveryEvents: row.deliveryEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      verificationSid: event.verificationSid,
      attemptSid: event.attemptSid,
      channel: event.channel,
      mcc: event.mcc,
      mnc: event.mnc,
      numberSegments: event.numberSegments,
      eventTime: event.eventTime.toISOString(),
      receivedAt: event.receivedAt.toISOString(),
    })),
  };
}

export function createAdminOtpRouter({ prisma: client }: AdminOtpDeps): Router {
  const router = Router();

  router.get('/otp-attempts', validate(listQuerySchema, 'query'), async (req, res, next) => {
    try {
      if (!client) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const query = req.query as unknown as ListQuery;
      const where: Prisma.OtpAttemptWhereInput = {};

      if (query.app) where.app = query.app;
      if (query.status) where.status = query.status;
      if (query.phoneLast2) where.phoneLast2 = query.phoneLast2;
      if (query.from || query.to) {
        where.requestedAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }
      if (query.device) {
        where.OR = [
          { deviceManufacturer: { contains: query.device, mode: 'insensitive' } },
          { deviceModel: { contains: query.device, mode: 'insensitive' } },
        ];
      }
      if (query.cursor) {
        // A cursor is an AND filter so it composes with the device OR above.
        where.AND = [cursorCondition(decodeCursor(query.cursor))];
      }

      const rows = await client.otpAttempt.findMany({
        where,
        select: listSelect,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });

      const page = rows.slice(0, query.limit);
      const last = page[page.length - 1];

      res.json({
        data: page.map(toListDto),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/otp-attempts/:id',
    validate(z.object({ id: z.uuid() }), 'params'),
    async (req, res, next) => {
      try {
        if (!client) {
          res.status(503).json({ error: { message: 'Database unavailable' } });
          return;
        }

        const attempt = await client.otpAttempt.findUnique({
          where: { id: routeParamId(req.params.id) },
          select: detailSelect,
        });
        if (!attempt) throw notFound('OTP attempt not found.');

        res.json({ data: toDetailDto(attempt) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

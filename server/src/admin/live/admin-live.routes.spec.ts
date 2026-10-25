import request from 'supertest';
import express from 'express';
import type { PrismaClient } from '../../database/prisma';
import { errorHandler } from '../../common/middleware/error-handler';
import { createAdminLiveRouter, liveDayBounds } from './admin-live.routes';

const JOB_ID = '11111111-2222-4333-8444-555555555555';

/** 2026-10-25 00:00 IST — the start of the day under test. */
const NOW = new Date('2026-10-24T20:00:00.000Z');
const DAY_START = '2026-10-24T18:30:00.000Z';
const DAY_END = '2026-10-25T18:30:00.000Z';

/** A row shaped like `jobListSelect`. */
function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: 'TRAVELLING',
    createdAt: new Date('2026-10-24T19:00:00.000Z'),
    acceptedAt: new Date('2026-10-24T19:05:00.000Z'),
    completedAt: null,
    cancelledAt: null,
    expiresAt: new Date('2026-10-24T19:34:00.000Z'),
    locationLabel: 'Andheri West',
    basePayPaise: 15_000,
    agreedPayPaise: 16_000,
    finalPayPaise: null,
    customSkill: null,
    customer: {
      id: 'cust-1',
      displayName: 'Ravi',
      deletedAt: null,
      profile: { id: 'customer-user', fullName: 'Ravi Kumar', phone: '+919876543210' },
    },
    pro: {
      id: 'pro-1',
      displayName: 'Suresh',
      deletedAt: null,
      profile: { id: 'pro-user', fullName: 'Suresh Patil', phone: '+919812345678' },
    },
    service: { id: 'svc-1', name: 'Electrical', slug: 'electrical' },
    skill: { id: 'skill-1', name: 'Fan installation', slug: 'fan-installation' },
    ...overrides,
  };
}

function buildClient(
  options: {
    rows?: unknown[];
    grouped?: Array<{ status: string; _count: { _all: number } }>;
    overdue?: number;
  } = {},
) {
  const findMany = jest.fn().mockResolvedValue(options.rows ?? [listRow()]);
  const groupBy = jest
    .fn()
    .mockResolvedValue(options.grouped ?? [{ status: 'TRAVELLING', _count: { _all: 1 } }]);
  const count = jest.fn().mockResolvedValue(options.overdue ?? 0);
  const queryRaw = jest.fn().mockResolvedValue([]);

  return {
    client: {
      job: { findMany, groupBy, count },
      $queryRaw: queryRaw,
    } as unknown as PrismaClient,
    findMany,
    groupBy,
    count,
    queryRaw,
  };
}

function appWith(client: PrismaClient) {
  return express()
    .use(express.json())
    .use('/live', createAdminLiveRouter({ prisma: client, now: () => NOW }))
    .use(errorHandler);
}

describe('admin live routes', () => {
  describe('liveDayBounds', () => {
    it('pins the day to Asia/Kolkata midnight, not the server time zone', () => {
      const { start, end } = liveDayBounds(NOW);

      expect(start.toISOString()).toBe(DAY_START);
      expect(end.toISOString()).toBe(DAY_END);
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('rolls over at IST midnight', () => {
      // 2026-10-25 23:59 IST and 2026-10-26 00:01 IST fall on different days.
      const late = liveDayBounds(new Date('2026-10-25T18:29:00.000Z'));
      const next = liveDayBounds(new Date('2026-10-25T18:31:00.000Z'));

      expect(late.start.toISOString()).toBe(DAY_START);
      expect(next.start.toISOString()).toBe('2026-10-25T18:30:00.000Z');
    });
  });

  describe('GET /live', () => {
    it("returns today's still-open jobs with counts", async () => {
      const { client, findMany, groupBy, count } = buildClient({
        grouped: [
          { status: 'REQUESTED', _count: { _all: 2 } },
          { status: 'TRAVELLING', _count: { _all: 1 } },
          { status: 'IN_PROGRESS', _count: { _all: 3 } },
          { status: 'PAYMENT_PENDING', _count: { _all: 1 } },
        ],
        overdue: 2,
      });

      const response = await request(appWith(client)).get('/live').expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { createdAt: { gte: new Date(DAY_START), lt: new Date(DAY_END) } },
              {
                status: {
                  in: [
                    'REQUESTED',
                    'OFFERED',
                    'ACCEPTED',
                    'TRAVELLING',
                    'ARRIVED',
                    'IN_PROGRESS',
                    'COMPLETED',
                    'PAYMENT_PENDING',
                  ],
                },
              },
            ],
          },
          take: 201,
        }),
      );

      const findManyArgs = (
        findMany.mock.calls as unknown as Array<[Record<string, unknown>]>
      )[0]?.[0];
      expect(findManyArgs?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);

      expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['status'] }));
      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { status: { in: ['REQUESTED', 'OFFERED'] } },
              { expiresAt: { lt: NOW } },
            ]),
          },
        }),
      );

      expect(response.body).toMatchObject({
        summary: {
          total: 7,
          waitingForPro: 2,
          enRoute: 1,
          inProgress: 3,
          paymentPending: 1,
          overdue: 2,
        },
        day: { start: DAY_START, end: DAY_END, timeZone: 'Asia/Kolkata' },
        generatedAt: NOW.toISOString(),
        truncated: false,
      });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: JOB_ID,
        status: 'TRAVELLING',
        customSkill: null,
        customer: { id: 'cust-1', displayName: 'Ravi', phone: '+919876543210' },
      });
    });

    it('sorts by soonest expiry, nulls last', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client)).get('/live?sort=expiring').expect(200);

      const findManyArgs = (
        findMany.mock.calls as unknown as Array<[Record<string, unknown>]>
      )[0]?.[0];
      expect(findManyArgs?.orderBy).toEqual([
        { expiresAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('sorts by amount for a quick triage of big-ticket jobs', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client)).get('/live?sort=amount_desc').expect(200);

      const findManyArgs = (
        findMany.mock.calls as unknown as Array<[Record<string, unknown>]>
      )[0]?.[0];
      expect(findManyArgs?.orderBy).toEqual([
        { basePayPaise: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('narrows to the requested statuses', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client)).get('/live?status=TRAVELLING,ARRIVED').expect(200);

      const findManyArgs = (
        findMany.mock.calls as unknown as Array<[Record<string, unknown>]>
      )[0]?.[0];
      const where = findManyArgs?.where as { AND: Array<Record<string, unknown>> };
      expect(where.AND[1]).toEqual({ status: { in: ['TRAVELLING', 'ARRIVED'] } });
    });

    it('searches a partial job id without an unbounded scan', async () => {
      const { client, findMany, queryRaw } = buildClient();
      queryRaw.mockResolvedValue([{ id: JOB_ID }]);

      await request(appWith(client)).get('/live?q=11111111').expect(200);

      expect(queryRaw).toHaveBeenCalled();
      const findManyArgs = (
        findMany.mock.calls as unknown as Array<[Record<string, unknown>]>
      )[0]?.[0];
      const where = findManyArgs?.where as { AND: Array<Record<string, unknown>> };
      expect(where.AND[2]).toEqual({ id: { in: [JOB_ID] } });
    });

    it('flags a snapshot that hit the 200-row ceiling', async () => {
      const { client } = buildClient({
        rows: Array.from({ length: 201 }, (_, index) => listRow({ id: `job-${index}` })),
      });

      const response = await request(appWith(client)).get('/live').expect(200);

      expect(response.body.truncated).toBe(true);
      expect(response.body.data).toHaveLength(200);
    });

    it('rejects a settled status and an unknown sort', async () => {
      const { client } = buildClient();

      await request(appWith(client)).get('/live?status=PAID').expect(422);
      await request(appWith(client)).get('/live?sort=whatever').expect(422);
    });

    it('returns 503 without a database', async () => {
      const app = express()
        .use('/live', createAdminLiveRouter({ prisma: null, now: () => NOW }))
        .use(errorHandler);

      const response = await request(app).get('/live').expect(503);
      expect(response.body.error.message).toBe('Database unavailable');
    });
  });
});

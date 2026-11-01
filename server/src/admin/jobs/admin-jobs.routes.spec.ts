import request from 'supertest';
import express from 'express';
import { ApiErrorCode } from '@samona/types';
import type { PrismaClient } from '../../database/prisma';
import type { StorageService } from '../../files/storage.service';
import { errorHandler } from '../../common/middleware/error-handler';
import { createAdminJobsRouter } from './admin-jobs.routes';

const JOB_ID = '11111111-2222-4333-8444-555555555555';
const PRO_ID = '99999999-8888-4777-8666-555555555555';
const PRO_USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CUSTOMER_USER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const storage = {
  jobImagePublicUrl: (path: string) => `https://cdn.test/${path}`,
} as unknown as StorageService;

/** A row shaped like `listSelect`. */
function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: 'PAID',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    acceptedAt: new Date('2026-01-02T04:00:00.000Z'),
    completedAt: new Date('2026-01-02T05:00:00.000Z'),
    cancelledAt: null,
    expiresAt: new Date('2026-01-02T03:34:05.000Z'),
    locationLabel: 'Andheri West',
    basePayPaise: 15_000,
    agreedPayPaise: 16_000,
    finalPayPaise: 16_000,
    customer: {
      id: 'cust-1',
      displayName: 'Ravi',
      deletedAt: null,
      profile: { id: CUSTOMER_USER_ID, fullName: 'Ravi Kumar', phone: '+919876543210' },
    },
    pro: {
      id: PRO_ID,
      displayName: 'Suresh',
      deletedAt: null,
      profile: { id: PRO_USER_ID, fullName: 'Suresh Patil', phone: '+919812345678' },
    },
    service: { id: 'svc-1', name: 'Electrical', slug: 'electrical' },
    skill: { id: 'skill-1', name: 'Fan installation', slug: 'fan-installation' },
    ...overrides,
  };
}

/** A row shaped like `detailSelect` — list fields plus the detail joins. */
function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...listRow(),
    updatedAt: new Date('2026-01-02T05:00:00.000Z'),
    customSkill: null,
    description: 'Fix the switch near the door.',
    imagePaths: ['jobs/abc.jpg'],
    latitude: 19.1197,
    longitude: 72.8468,
    startOtpAttempts: 0,
    customer: {
      id: 'cust-1',
      displayName: 'Ravi',
      avatarUrl: null,
      locationLabel: 'Andheri West',
      latitude: 19.1197,
      longitude: 72.8468,
      deletedAt: null,
      profile: {
        id: CUSTOMER_USER_ID,
        fullName: 'Ravi Kumar',
        phone: '+919876543210',
        isActive: true,
      },
    },
    statusHistory: [],
    jobOffers: [
      {
        id: 'offer-1',
        proId: PRO_ID,
        expiresAt: new Date('2026-01-02T03:34:05.000Z'),
        consumedAt: new Date('2026-01-02T03:10:00.000Z'),
        outcome: 'ACCEPTED',
        createdAt: new Date('2026-01-02T03:05:00.000Z'),
      },
    ],
    declines: [],
    ...overrides,
  };
}

function buildClient(options: { rows?: unknown[]; detail?: unknown } = {}) {
  const findMany = jest.fn().mockResolvedValue(options.rows ?? [listRow()]);
  const findUnique = jest
    .fn()
    .mockResolvedValue(options.detail === undefined ? detailRow() : options.detail);
  const queryRaw = jest.fn().mockResolvedValue([]);

  return {
    client: {
      job: { findMany, findUnique },
      $queryRaw: queryRaw,
    } as unknown as PrismaClient,
    findMany,
    findUnique,
    queryRaw,
  };
}

function appWith(client: PrismaClient) {
  return express()
    .use(express.json())
    .use('/jobs', createAdminJobsRouter({ prisma: client, storage }))
    .use(errorHandler);
}

describe('admin jobs routes', () => {
  describe('GET /jobs', () => {
    it('returns a page of bookings and no cursor on a short page', async () => {
      const { client, findMany } = buildClient();

      const response = await request(appWith(client)).get('/jobs').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: JOB_ID,
        status: 'PAID',
        customer: { displayName: 'Ravi', phone: '+919876543210' },
        pro: { id: PRO_ID, displayName: 'Suresh' },
        service: { name: 'Electrical' },
        skill: { name: 'Fan installation' },
        finalPayPaise: 16_000,
      });
      expect(response.body.data[0].createdAt).toBe('2026-01-02T03:04:05.000Z');
      expect(response.body.nextCursor).toBeNull();

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 26, // default limit + 1 look-ahead row
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('never leaks start codes or offer credentials', async () => {
      const { client } = buildClient();
      const response = await request(appWith(client)).get('/jobs').expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('verificationOtp');
      expect(serialized).not.toContain('tokenHash');
      expect(serialized).not.toContain('deviceId');
    });

    it('reads repeated and comma-separated status filters', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client)).get('/jobs?status=PAID,CANCELLED').expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { in: ['PAID', 'CANCELLED'] } } }),
      );
    });

    it('filters by service, customer and pro', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client))
        .get(`/jobs?serviceId=${PRO_ID}&customerId=${PRO_ID}&proId=${PRO_ID}`)
        .expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceId: PRO_ID, customerId: PRO_ID, proId: PRO_ID },
        }),
      );
    });

    it('turns a date range into createdAt bounds', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client))
        .get('/jobs?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.999Z')
        .expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lte: new Date('2026-01-31T23:59:59.999Z'),
            },
          },
        }),
      );
    });

    it('rejects a date range whose end is not after its start', async () => {
      const { client } = buildClient();

      const response = await request(appWith(client))
        .get('/jobs?from=2026-01-31T00:00:00.000Z&to=2026-01-01T00:00:00.000Z')
        .expect(422);

      expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    });

    it('searches by name without touching raw SQL', async () => {
      const { client, findMany, queryRaw } = buildClient();

      await request(appWith(client)).get('/jobs?q=Ravi').expect(200);

      expect(queryRaw).not.toHaveBeenCalled();
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: expect.arrayContaining([
                  { customer: { displayName: { contains: 'Ravi', mode: 'insensitive' } } },
                ]),
              },
            ],
          },
        }),
      );
    });

    it('resolves a partial job id with a bounded prefix query', async () => {
      const { client, findMany, queryRaw } = buildClient();
      queryRaw.mockResolvedValue([{ id: JOB_ID }]);

      await request(appWith(client))
        .get(`/jobs?q=${JOB_ID.slice(0, 8)}`)
        .expect(200);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ id: { in: [JOB_ID] } }] },
        }),
      );
    });

    it('pages with an opaque cursor instead of an offset', async () => {
      const first = listRow();
      const second = listRow({ id: PRO_ID, createdAt: new Date('2026-01-01T00:00:00.000Z') });
      const { client, findMany } = buildClient({ rows: [first, second] });

      const pageOne = await request(appWith(client)).get('/jobs?limit=1').expect(200);
      expect(pageOne.body.data).toHaveLength(1);
      expect(pageOne.body.nextCursor).toEqual(expect.any(String));

      const decoded = JSON.parse(
        Buffer.from(pageOne.body.nextCursor, 'base64url').toString('utf8'),
      );
      expect(decoded).toEqual({ createdAt: '2026-01-02T03:04:05.000Z', id: JOB_ID });

      await request(appWith(client))
        .get(`/jobs?limit=1&cursor=${pageOne.body.nextCursor}`)
        .expect(200);

      expect(findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { createdAt: { lt: new Date('2026-01-02T03:04:05.000Z') } },
                  { createdAt: new Date('2026-01-02T03:04:05.000Z'), id: { lt: JOB_ID } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('rejects a tampered cursor instead of failing in the database', async () => {
      const { client, findMany } = buildClient();

      const response = await request(appWith(client))
        .get('/jobs?cursor=definitely-not-a-cursor')
        .expect(400);

      expect(response.body.error.code).toBe(ApiErrorCode.BAD_REQUEST);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects a cursor whose id is not a uuid', async () => {
      const { client, findMany } = buildClient();
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: '2026-01-02T03:04:05.000Z', id: 'not-a-uuid' }),
      ).toString('base64url');

      const response = await request(appWith(client)).get(`/jobs?cursor=${cursor}`).expect(400);

      expect(response.body.error.code).toBe(ApiErrorCode.BAD_REQUEST);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range limit', async () => {
      const { client } = buildClient();

      await request(appWith(client)).get('/jobs?limit=101').expect(422);
    });

    it('returns 503 without a database', async () => {
      const app = express()
        .use('/jobs', createAdminJobsRouter({ prisma: null, storage }))
        .use(errorHandler);

      const response = await request(app).get('/jobs').expect(503);
      expect(response.body.error.message).toBe('Database unavailable');
    });
  });

  describe('GET /jobs/:id', () => {
    it('returns the booking detail with a masked start code', async () => {
      const { client, findUnique } = buildClient();

      const response = await request(appWith(client)).get(`/jobs/${JOB_ID}`).expect(200);

      expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: JOB_ID } }));

      const booking = response.body.data;
      expect(booking).toMatchObject({
        id: JOB_ID,
        description: 'Fix the switch near the door.',
        verificationOtp: null,
        startOtpAttempts: 0,
        imageUrls: ['https://cdn.test/jobs/abc.jpg'],
        customer: {
          displayName: 'Ravi',
          profile: { fullName: 'Ravi Kumar', phone: '+919876543210', isActive: true },
        },
      });
      expect(booking.offers).toEqual([
        {
          id: 'offer-1',
          proId: PRO_ID,
          expiresAt: '2026-01-02T03:34:05.000Z',
          consumedAt: '2026-01-02T03:10:00.000Z',
          outcome: 'ACCEPTED',
          createdAt: '2026-01-02T03:05:00.000Z',
        },
      ]);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('tokenHash');
      expect(serialized).not.toContain('deviceId');
    });

    it('names who changed each status instead of leaking profile ids', async () => {
      const { client } = buildClient({
        detail: detailRow({
          statusHistory: [
            {
              id: 'hist-1',
              fromStatus: null,
              toStatus: 'REQUESTED',
              changedById: CUSTOMER_USER_ID,
              createdAt: new Date('2026-01-02T03:04:05.000Z'),
            },
            {
              id: 'hist-2',
              fromStatus: 'ACCEPTED',
              toStatus: 'TRAVELLING',
              changedById: PRO_USER_ID,
              createdAt: new Date('2026-01-02T04:30:00.000Z'),
            },
            {
              id: 'hist-3',
              fromStatus: 'TRAVELLING',
              toStatus: 'ARRIVED',
              changedById: null,
              createdAt: new Date('2026-01-02T04:40:00.000Z'),
            },
          ],
        }),
      });

      const response = await request(appWith(client)).get(`/jobs/${JOB_ID}`).expect(200);

      expect(response.body.data.statusHistory).toEqual([
        {
          id: 'hist-1',
          fromStatus: null,
          toStatus: 'REQUESTED',
          changedBy: { id: 'cust-1', name: 'Ravi', role: 'CUSTOMER' },
          createdAt: '2026-01-02T03:04:05.000Z',
        },
        {
          id: 'hist-2',
          fromStatus: 'ACCEPTED',
          toStatus: 'TRAVELLING',
          changedBy: { id: PRO_ID, name: 'Suresh', role: 'PRO' },
          createdAt: '2026-01-02T04:30:00.000Z',
        },
        {
          id: 'hist-3',
          fromStatus: 'TRAVELLING',
          toStatus: 'ARRIVED',
          changedBy: { id: null, name: null, role: 'SYSTEM' },
          createdAt: '2026-01-02T04:40:00.000Z',
        },
      ]);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(CUSTOMER_USER_ID);
      expect(serialized).not.toContain(PRO_USER_ID);
    });

    it('keeps a tombstoned actor unnamed in the timeline', async () => {
      const { client } = buildClient({
        detail: detailRow({
          pro: {
            ...detailRow().pro,
            deletedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
          statusHistory: [
            {
              id: 'hist-1',
              fromStatus: 'ACCEPTED',
              toStatus: 'TRAVELLING',
              changedById: PRO_USER_ID,
              createdAt: new Date('2026-01-02T04:30:00.000Z'),
            },
          ],
        }),
      });

      const response = await request(appWith(client)).get(`/jobs/${JOB_ID}`).expect(200);

      expect(response.body.data.statusHistory[0].changedBy).toEqual({
        id: PRO_ID,
        name: null,
        role: 'PRO',
      });
    });

    it('hides a tombstoned customer but keeps the booking', async () => {
      const { client } = buildClient({
        detail: detailRow({
          customer: {
            ...detailRow().customer,
            deletedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        }),
      });

      const response = await request(appWith(client)).get(`/jobs/${JOB_ID}`).expect(200);

      expect(response.body.data.customer).toMatchObject({
        displayName: null,
        avatarUrl: null,
        locationLabel: null,
        latitude: null,
        longitude: null,
        profile: { fullName: null, phone: null },
      });
    });

    it('404s an unknown booking', async () => {
      const { client } = buildClient({ detail: null });

      const response = await request(appWith(client)).get(`/jobs/${JOB_ID}`).expect(404);

      expect(response.body.error.code).toBe(ApiErrorCode.NOT_FOUND);
    });

    it('422s a non-uuid booking id', async () => {
      const { client, findUnique } = buildClient();

      const response = await request(appWith(client)).get('/jobs/not-a-uuid').expect(422);

      expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });
});

import request from 'supertest';
import express from 'express';
import { ApiErrorCode } from '@samona/types';
import type { PrismaClient } from '../../database/prisma';
import { errorHandler } from '../../common/middleware/error-handler';
import { createAdminOtpRouter } from './admin-otp.routes';

const ATTEMPT_ID = '11111111-2222-4333-8444-555555555555';
const SECOND_ID = '99999999-8888-4777-8666-555555555555';

/** A row shaped like `listSelect`. Deliberately includes `phoneHash` so we can
 *  assert the DTO strips it. */
function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    requestedAt: new Date('2026-11-17T10:00:00.000Z'),
    app: 'PRO',
    phoneLast2: '42',
    phoneHash: 'a'.repeat(64),
    deviceManufacturer: 'vivo',
    deviceModel: 'V2217',
    osVersion: '13',
    status: 'DELIVERED',
    verificationSid: 'VE11111111111111111111111111111111',
    attemptSid: null,
    lastEventAt: new Date('2026-11-17T10:00:09.000Z'),
    _count: { deliveryEvents: 2 },
    ...overrides,
  };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    eventType: 'com.twilio.accountsecurity.verify.message.delivered',
    status: 'DELIVERED',
    verificationSid: 'VE11111111111111111111111111111111',
    attemptSid: null,
    channel: 'sms',
    mcc: '404',
    mnc: '45',
    numberSegments: 1,
    eventTime: new Date('2026-11-17T10:00:09.000Z'),
    receivedAt: new Date('2026-11-17T10:00:10.000Z'),
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...listRow(),
    deliveryEvents: [
      eventRow({
        id: 'event-0',
        eventType: 'com.twilio.accountsecurity.verify.message.sent',
        status: 'SENT',
        eventTime: new Date('2026-11-17T10:00:02.000Z'),
      }),
      eventRow(),
    ],
    ...overrides,
  };
}

function buildClient(options: { rows?: unknown[]; detail?: unknown } = {}) {
  const findMany = jest.fn().mockResolvedValue(options.rows ?? [listRow()]);
  const findUnique = jest
    .fn()
    .mockResolvedValue(options.detail === undefined ? detailRow() : options.detail);

  return {
    client: { otpAttempt: { findMany, findUnique } } as unknown as PrismaClient,
    findMany,
    findUnique,
  };
}

function appWith(client: PrismaClient) {
  return express()
    .use(express.json())
    .use(createAdminOtpRouter({ prisma: client }))
    .use(errorHandler);
}

describe('admin OTP telemetry routes', () => {
  describe('GET /otp-attempts', () => {
    it('returns a page of attempts and no cursor on a short page', async () => {
      const { client, findMany } = buildClient();

      const response = await request(appWith(client)).get('/otp-attempts').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: ATTEMPT_ID,
        app: 'PRO',
        phoneLast2: '42',
        deviceManufacturer: 'vivo',
        deviceModel: 'V2217',
        status: 'DELIVERED',
        eventCount: 2,
        requestedAt: '2026-11-17T10:00:00.000Z',
        lastEventAt: '2026-11-17T10:00:09.000Z',
      });
      expect(response.body.nextCursor).toBeNull();

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 26, // default limit + 1 look-ahead row
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('never leaks the phone hash, a full number, or an OTP', async () => {
      const { client } = buildClient();

      const response = await request(appWith(client)).get('/otp-attempts').expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('phoneHash');
      expect(serialized).not.toContain('a'.repeat(64));
      expect(serialized).not.toContain('+91');
      expect(serialized).not.toContain('otp');
      expect(serialized).not.toContain('code');
    });

    it('filters by app, status, phone last two and device', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client))
        .get('/otp-attempts?app=CUSTOMER&status=FAILED&phoneLast2=42&device=vivo')
        .expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            app: 'CUSTOMER',
            status: 'FAILED',
            phoneLast2: '42',
            OR: [
              { deviceManufacturer: { contains: 'vivo', mode: 'insensitive' } },
              { deviceModel: { contains: 'vivo', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('turns a date range into requestedAt bounds', async () => {
      const { client, findMany } = buildClient();

      await request(appWith(client))
        .get('/otp-attempts?from=2026-11-17T00:00:00.000Z&to=2026-11-18T00:00:00.000Z')
        .expect(200);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            requestedAt: {
              gte: new Date('2026-11-17T00:00:00.000Z'),
              lte: new Date('2026-11-18T00:00:00.000Z'),
            },
          },
        }),
      );
    });

    it('pages with an opaque cursor instead of an offset', async () => {
      const first = listRow();
      const second = listRow({ id: SECOND_ID, requestedAt: new Date('2026-11-16T10:00:00.000Z') });
      const { client, findMany } = buildClient({ rows: [first, second] });

      const pageOne = await request(appWith(client)).get('/otp-attempts?limit=1').expect(200);
      expect(pageOne.body.data).toHaveLength(1);
      expect(pageOne.body.nextCursor).toEqual(expect.any(String));

      const decoded = JSON.parse(
        Buffer.from(pageOne.body.nextCursor, 'base64url').toString('utf8'),
      );
      expect(decoded).toEqual({ requestedAt: '2026-11-17T10:00:00.000Z', id: ATTEMPT_ID });

      await request(appWith(client))
        .get(`/otp-attempts?limit=1&cursor=${pageOne.body.nextCursor}`)
        .expect(200);

      expect(findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { requestedAt: { lt: new Date('2026-11-17T10:00:00.000Z') } },
                  {
                    requestedAt: new Date('2026-11-17T10:00:00.000Z'),
                    id: { lt: ATTEMPT_ID },
                  },
                ],
              },
            ],
          },
        }),
      );
    });

    it('composes the cursor with a device filter without dropping either', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ requestedAt: '2026-11-17T10:00:00.000Z', id: ATTEMPT_ID }),
      ).toString('base64url');
      const { client, findMany } = buildClient();

      await request(appWith(client)).get(`/otp-attempts?device=vivo&cursor=${cursor}`).expect(200);

      const where = findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(2); // device condition intact
      expect(where.AND).toHaveLength(1); // cursor condition added
    });

    it('rejects a tampered cursor instead of failing in the database', async () => {
      const { client, findMany } = buildClient();

      const response = await request(appWith(client))
        .get('/otp-attempts?cursor=not-a-cursor')
        .expect(400);

      expect(response.body.error.code).toBe(ApiErrorCode.BAD_REQUEST);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects invalid filters', async () => {
      const { client } = buildClient();

      await request(appWith(client)).get('/otp-attempts?phoneLast2=abc').expect(422);
      await request(appWith(client)).get('/otp-attempts?app=ADMIN').expect(422);
      await request(appWith(client)).get('/otp-attempts?status=BOGUS').expect(422);
      await request(appWith(client)).get('/otp-attempts?limit=101').expect(422);
    });

    it('rejects a date range whose end is not after its start', async () => {
      const { client } = buildClient();

      await request(appWith(client))
        .get('/otp-attempts?from=2026-11-18T00:00:00.000Z&to=2026-11-17T00:00:00.000Z')
        .expect(422);
    });

    it('returns 503 without a database', async () => {
      const app = express()
        .use(createAdminOtpRouter({ prisma: null }))
        .use(errorHandler);

      const response = await request(app).get('/otp-attempts').expect(503);
      expect(response.body.error.message).toBe('Database unavailable');
    });
  });

  describe('GET /otp-attempts/:id', () => {
    it('returns the attempt with its delivery events in time order', async () => {
      const { client, findUnique } = buildClient();

      const response = await request(appWith(client))
        .get(`/otp-attempts/${ATTEMPT_ID}`)
        .expect(200);

      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ATTEMPT_ID } }),
      );

      const attempt = response.body.data;
      expect(attempt).toMatchObject({
        id: ATTEMPT_ID,
        app: 'PRO',
        phoneLast2: '42',
        eventCount: 2,
      });
      expect(attempt.deliveryEvents.map((event: { id: string }) => event.id)).toEqual([
        'event-0',
        'event-1',
      ]);
      expect(attempt.deliveryEvents[1]).toMatchObject({
        status: 'DELIVERED',
        mcc: '404',
        mnc: '45',
        channel: 'sms',
        numberSegments: 1,
        eventTime: '2026-11-17T10:00:09.000Z',
        receivedAt: '2026-11-17T10:00:10.000Z',
      });
    });

    it('never leaks the phone hash, a full number, or an OTP in the detail', async () => {
      const { client } = buildClient();

      const response = await request(appWith(client))
        .get(`/otp-attempts/${ATTEMPT_ID}`)
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('phoneHash');
      expect(serialized).not.toContain('a'.repeat(64));
      expect(serialized).not.toContain('+91');
    });

    it('returns 404 for an unknown attempt', async () => {
      const { client } = buildClient({ detail: null });

      const response = await request(appWith(client))
        .get(`/otp-attempts/${ATTEMPT_ID}`)
        .expect(404);

      expect(response.body.error.code).toBe(ApiErrorCode.NOT_FOUND);
    });

    it('rejects a non-uuid id', async () => {
      const { client, findUnique } = buildClient();

      await request(appWith(client)).get('/otp-attempts/not-a-uuid').expect(422);

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns 503 without a database', async () => {
      const app = express()
        .use(createAdminOtpRouter({ prisma: null }))
        .use(errorHandler);

      await request(app).get(`/otp-attempts/${ATTEMPT_ID}`).expect(503);
    });
  });
});

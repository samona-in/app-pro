import express from 'express';
import request from 'supertest';
import type { PrismaClient } from '../../database/prisma';
import type { AppConfig } from '../../config';
import type { Services } from '../../context';
import { isHttpError } from '../../common/errors';
import { createAdminNotificationsRouter } from './admin-notifications.routes';
import { validateCampaignDeepLink } from './admin-notifications.shared';

const PRO_ID = '11111111-1111-4111-8111-111111111111';
const PRO_USER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_USER_ID = '44444444-4444-4444-8444-444444444444';

type NotificationFakes = {
  sendCampaignNotification: jest.Mock;
  campaignTargetsForUser: jest.Mock;
  recordCampaignNotification: jest.Mock;
};

function makeApp(prisma: Record<string, unknown>, notifications: NotificationFakes) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { adminUser: { id: string } }).adminUser = { id: 'admin-1' };
    next();
  });
  app.use(
    createAdminNotificationsRouter({
      prisma: prisma as unknown as PrismaClient,
      config: {} as AppConfig,
      services: { notifications } as unknown as Services,
    }),
  );
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = isHttpError(error) ? error.status : 500;
      res
        .status(status)
        .json({ error: { message: error instanceof Error ? error.message : 'Error' } });
    },
  );
  return app;
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    notificationCampaign: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: 'campaign-1', ...data })),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    notificationCampaignRecipient: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'recipient-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    proProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: PRO_ID,
        userId: PRO_USER_ID,
        deletedAt: null,
        deletionRequestedAt: null,
        displayName: 'Pro One',
        profile: {
          fullName: null,
          phone: '+919000000001',
          isActive: true,
          deletedAt: null,
        },
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    customerProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

function makeNotifications(targets: unknown[] = []) {
  return {
    sendCampaignNotification: jest.fn().mockResolvedValue({ ok: true }),
    campaignTargetsForUser: jest.fn().mockResolvedValue(targets),
    recordCampaignNotification: jest.fn().mockResolvedValue(undefined),
  };
}

const baseCampaign = {
  name: 'Account update',
  title: 'Profile approved',
  body: 'Your profile has been approved.',
  type: 'CUSTOM_NOTIFICATIONS',
  deepLink: '/profile',
  sendNow: true,
};

describe('admin individual notifications', () => {
  it('sends to every device of the selected pro and writes one pro inbox row', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications([
      {
        pushToken: 'fcm-one',
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        deviceId: 'device-one',
      },
      {
        pushToken: 'fcm-two',
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        deviceId: 'device-two',
      },
    ]);

    const response = await request(makeApp(prisma, notifications))
      .post('/campaigns')
      .send({
        ...baseCampaign,
        audience: 'INDIVIDUAL_PRO',
        audienceFilters: { recipientId: PRO_ID },
      });

    expect(response.status).toBe(200);
    expect(notifications.campaignTargetsForUser).toHaveBeenCalledWith(PRO_USER_ID, 'PRO');
    expect(notifications.sendCampaignNotification).toHaveBeenCalledTimes(2);
    expect(notifications.sendCampaignNotification).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fcm-one', title: 'Profile approved' }),
    );
    expect(notifications.recordCampaignNotification).toHaveBeenCalledTimes(1);
    expect(notifications.recordCampaignNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'PRO',
        profileId: PRO_ID,
        userId: PRO_USER_ID,
        route: '/profile',
        delivered: true,
      }),
    );
    expect(prisma.notificationCampaignRecipient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'campaign-1',
          proId: PRO_ID,
          userId: PRO_USER_ID,
          status: 'SENT',
        }),
      }),
    );
  });

  it('sends to the selected customer and writes one customer inbox row', async () => {
    const prisma = makePrisma({
      customerProfile: {
        ...makePrisma().customerProfile,
        findUnique: jest.fn().mockResolvedValue({
          id: CUSTOMER_ID,
          userId: CUSTOMER_USER_ID,
          deletedAt: null,
          deletionRequestedAt: null,
          displayName: 'Customer One',
          profile: {
            fullName: null,
            phone: '+919000000002',
            isActive: true,
            deletedAt: null,
          },
        }),
      },
    });
    const notifications = makeNotifications([
      {
        pushToken: 'fcm-customer',
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        deviceId: null,
      },
    ]);

    const response = await request(makeApp(prisma, notifications))
      .post('/campaigns')
      .send({
        ...baseCampaign,
        audience: 'INDIVIDUAL_CUSTOMER',
        audienceFilters: { recipientId: CUSTOMER_ID },
        deepLink: '/bookings',
      });

    expect(response.status).toBe(200);
    expect(notifications.campaignTargetsForUser).toHaveBeenCalledWith(CUSTOMER_USER_ID, 'CUSTOMER');
    expect(notifications.recordCampaignNotification).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'CUSTOMER', profileId: CUSTOMER_ID, route: '/bookings' }),
    );
    expect(prisma.notificationCampaignRecipient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerId: CUSTOMER_ID, proId: undefined }),
      }),
    );
  });

  it('rejects a pro id for a customer audience without sending anything', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications([{ pushToken: 'fcm-one' }]);

    const response = await request(makeApp(prisma, notifications))
      .post('/campaigns')
      .send({
        ...baseCampaign,
        audience: 'INDIVIDUAL_CUSTOMER',
        audienceFilters: { recipientId: PRO_ID },
      });

    expect(response.status).toBe(400);
    expect(notifications.sendCampaignNotification).not.toHaveBeenCalled();
    expect(notifications.recordCampaignNotification).not.toHaveBeenCalled();
  });

  it('rejects a malformed recipient id', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications([{ pushToken: 'fcm-one' }]);

    const response = await request(makeApp(prisma, notifications))
      .post('/campaigns')
      .send({
        ...baseCampaign,
        audience: 'INDIVIDUAL_PRO',
        audienceFilters: { recipientId: 'not-a-uuid' },
      });

    expect(response.status).toBe(400);
    expect(notifications.sendCampaignNotification).not.toHaveBeenCalled();
  });

  it('keeps broadcast campaigns push-only', async () => {
    const prisma = makePrisma({
      proProfile: {
        ...makePrisma().proProfile,
        findMany: jest.fn().mockResolvedValue([
          {
            id: PRO_ID,
            userId: PRO_USER_ID,
            pushToken: 'fcm-broadcast',
            pushPlatform: 'ANDROID',
            pushProvider: 'FCM',
          },
        ]),
      },
    });
    const notifications = makeNotifications();

    const response = await request(makeApp(prisma, notifications))
      .post('/campaigns')
      .send({ ...baseCampaign, audience: 'ALL_PROFESSIONALS', deepLink: undefined });

    expect(response.status).toBe(200);
    expect(notifications.sendCampaignNotification).toHaveBeenCalledTimes(1);
    expect(notifications.recordCampaignNotification).not.toHaveBeenCalled();
  });

  it('searches recipients without exposing push tokens', async () => {
    const prisma = makePrisma({
      proProfile: {
        ...makePrisma().proProfile,
        findMany: jest.fn().mockResolvedValue([
          {
            id: PRO_ID,
            userId: PRO_USER_ID,
            displayName: 'Pro One',
            isOnline: true,
            isVerified: false,
            pushToken: 'secret-device-token',
            profile: { fullName: null, phone: '+919000000001' },
          },
        ]),
      },
    });

    const response = await request(makeApp(prisma, makeNotifications()))
      .get('/recipients')
      .query({ surface: 'PRO', q: 'Pro One' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: PRO_ID,
      userId: PRO_USER_ID,
      name: 'Pro One',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-device-token');
  });

  it('does not write a second inbox row when an individual campaign is retried', async () => {
    const storedCampaign = {
      id: 'campaign-1',
      audience: 'INDIVIDUAL_PRO',
      audienceFilters: { recipientId: PRO_ID },
      deepLink: '/profile',
      status: 'DRAFT',
    };
    const prisma = makePrisma({
      notificationCampaign: {
        ...makePrisma().notificationCampaign,
        findUnique: jest.fn().mockResolvedValue(storedCampaign),
        update: jest.fn().mockImplementation(({ data }) => ({ ...storedCampaign, ...data })),
      },
      notificationCampaignRecipient: {
        ...makePrisma().notificationCampaignRecipient,
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'recipient-1' }),
      },
    });
    const notifications = makeNotifications([
      {
        pushToken: 'fcm-one',
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        deviceId: null,
      },
    ]);
    const app = makeApp(prisma, notifications);

    expect(
      (
        await request(app)
          .post('/campaigns')
          .send({
            ...baseCampaign,
            sendNow: false,
            audience: 'INDIVIDUAL_PRO',
            audienceFilters: { recipientId: PRO_ID },
          })
      ).status,
    ).toBe(200);
    expect((await request(app).post('/campaigns/campaign-1/send').send({})).status).toBe(200);
    expect((await request(app).post('/campaigns/campaign-1/send').send({})).status).toBe(200);

    expect(notifications.recordCampaignNotification).toHaveBeenCalledTimes(1);
    expect(prisma.notificationCampaignRecipient.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a free-text deep link instead of storing a navigable value', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();

    const response = await request(makeApp(prisma, notifications))
      .post('/campaigns')
      .send({
        ...baseCampaign,
        audience: 'INDIVIDUAL_PRO',
        audienceFilters: { recipientId: PRO_ID },
        deepLink: 'samonapro://job/123',
      });

    expect(response.status).toBe(400);
    expect(prisma.notificationCampaign.create).not.toHaveBeenCalled();
    expect(notifications.sendCampaignNotification).not.toHaveBeenCalled();
  });

  it('allows the real home route and rejects the nonexistent singular notification route', () => {
    expect(validateCampaignDeepLink('ALL_PROFESSIONALS', '/home')).toBe('/home');
    expect(validateCampaignDeepLink('ALL_CUSTOMERS', '/home')).toBe('/home');
    expect(validateCampaignDeepLink('EVERYONE', '/home')).toBe('/home');

    expect(() => validateCampaignDeepLink('INDIVIDUAL_PRO', '/notification')).toThrow();
    expect(() => validateCampaignDeepLink('INDIVIDUAL_CUSTOMER', '/notification')).toThrow();
  });

  it('lists a pro notification history without exposing delivery credentials', async () => {
    const sentAt = new Date('2026-11-27T10:00:00.000Z');
    const prisma = makePrisma({
      notificationCampaignRecipient: {
        ...makePrisma().notificationCampaignRecipient,
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'recipient-1',
            status: 'SENT',
            sentAt,
            createdAt: sentAt,
            campaign: {
              id: 'campaign-1',
              title: 'Profile approved',
              body: 'Your profile has been approved.',
              type: 'CUSTOM_NOTIFICATIONS',
              deepLink: '/profile',
              sentAt,
              createdAt: sentAt,
              pushToken: 'secret-device-token',
              providerRef: 'secret-provider-ref',
            },
          },
        ]),
      },
    });

    const response = await request(makeApp(prisma, makeNotifications()))
      .get(`/recipients/PRO/${PRO_ID}/history`)
      .query({ limit: 10 });

    expect(response.status).toBe(200);
    expect(prisma.notificationCampaignRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          proId: PRO_ID,
          campaign: { audience: 'INDIVIDUAL_PRO' },
        }),
        take: 10,
      }),
    );
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: 'recipient-1',
      campaignId: 'campaign-1',
      title: 'Profile approved',
      status: 'SENT',
      sentAt: sentAt.toISOString(),
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-device-token');
    expect(JSON.stringify(response.body)).not.toContain('secret-provider-ref');
  });

  it('scopes history to the requested surface and validates the profile id', async () => {
    const prisma = makePrisma();
    const app = makeApp(prisma, makeNotifications());

    expect((await request(app).get(`/recipients/CUSTOMER/${CUSTOMER_ID}/history`)).status).toBe(
      200,
    );
    expect(prisma.notificationCampaignRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: CUSTOMER_ID,
          campaign: { audience: 'INDIVIDUAL_CUSTOMER' },
        }),
      }),
    );

    expect((await request(app).get('/recipients/PRO/not-a-uuid/history')).status).toBe(422);
  });
});

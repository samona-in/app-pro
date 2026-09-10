import { NotificationKind, type ChatMessage } from '@samona/types';
import {
  buildFcmPushMessage,
  buildFcmTerminalMessage,
  buildPushMessage,
  createNotificationsService,
} from './notifications.service';
import { verifyJobOffer } from '../jobs/job-offers';
import { REALTIME_EVENTS } from '../realtime/gateway';
import type { FcmMessagePayload } from './fcm';

const mockFcmSend = jest.fn();
jest.mock('./fcm', () => ({
  createFcmClient: jest.fn(() => ({ send: mockFcmSend })),
}));

const OFFER_SECRET = 'shared-offer-secret-that-is-long-enough';

const info = {
  jobId: 'job-1',
  serviceName: 'Electrical',
  customSkill: null,
  description: 'Fix the switch near the door.',
  basePayPaise: 15_000,
  address: '12 Market Rd',
  expiresAt: '2026-09-06T13:00:00.000Z',
};

function buildService() {
  const upsert = jest.fn().mockResolvedValue({});
  const proProfileFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    proProfile: { findMany: proProfileFindMany },
    notification: { upsert },
  };

  const service = createNotificationsService({
    prisma: prisma as never,
    config: { expoAccessToken: null, jobAlertRepeatMs: 60_000, jobAlertMaxRepeats: 0 } as never,
  });

  return { service, upsert, proProfileFindMany };
}

describe('createNotificationsService.alertEligiblePros', () => {
  it('records the offer for a pro without a push token so it lands in job history', async () => {
    const ctx = buildService();
    ctx.proProfileFindMany.mockResolvedValue([
      { id: 'pro-1', pushToken: null, jobAlertsEnabled: true },
    ]);

    await ctx.service.alertEligiblePros([{ proId: 'pro-1' }], info);

    expect(ctx.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          proId: 'pro-1',
          jobId: 'job-1',
          kind: NotificationKind.JOB_ALERT,
          delivered: false,
        }),
      }),
    );
  });

  it('records the offer even when alerts are disabled, but never pushes', async () => {
    const ctx = buildService();
    ctx.proProfileFindMany.mockResolvedValue([
      { id: 'pro-1', pushToken: 'ExponentPushToken[abc]', jobAlertsEnabled: false },
    ]);

    await ctx.service.alertEligiblePros([{ proId: 'pro-1' }], info);

    expect(ctx.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ proId: 'pro-1', jobId: 'job-1', delivered: false }),
      }),
    );
  });

  it('does nothing when there are no recipients', async () => {
    const ctx = buildService();

    await ctx.service.alertEligiblePros([], info);

    expect(ctx.upsert).not.toHaveBeenCalled();
    expect(ctx.proProfileFindMany).not.toHaveBeenCalled();
  });
});

describe('createNotificationsService.alertEligiblePros — job-offer minting', () => {
  const baseConfig = {
    expoAccessToken: null,
    jobAlertRepeatMs: 60_000,
    jobAlertMaxRepeats: 0,
    jobAlertTtlMs: 60_000,
    jobOfferTtlMs: 90_000,
    fcmProjectId: 'samona-test',
    fcmClientEmail: 'svc@samona-test.iam.gserviceaccount.com',
    fcmPrivateKey: '-----BEGIN PRIVATE KEY-----',
  };

  function mintService(overrides: Record<string, unknown>) {
    const upsert = jest.fn().mockResolvedValue({});
    const jobOfferCreate = jest.fn().mockResolvedValue({ id: 'offer-1' });
    const proProfileFindMany = jest.fn().mockResolvedValue([
      {
        id: 'pro-1',
        pushToken: 'fcm-registration-token-1',
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        pushDeviceId: 'device-1',
        jobAlertsEnabled: true,
      },
    ]);
    const prisma = {
      proProfile: { findMany: proProfileFindMany },
      notification: { upsert },
      jobOffer: { create: jobOfferCreate },
    };
    const service = createNotificationsService({
      prisma: prisma as never,
      config: { ...baseConfig, ...overrides } as never,
    });
    return { service, jobOfferCreate, proProfileFindMany };
  }

  beforeEach(() => {
    mockFcmSend.mockReset();
    mockFcmSend.mockResolvedValue({ ok: true, messageId: 'msg-1' });
  });

  it('mints and persists a redeemable single-use token for an FCM pro with a device', async () => {
    const { service, jobOfferCreate } = mintService({ jobOfferSecret: OFFER_SECRET });

    await service.alertEligiblePros([{ proId: 'pro-1' }], info);

    expect(jobOfferCreate).toHaveBeenCalledTimes(1);
    const row = jobOfferCreate.mock.calls[0][0] as {
      data: { jobId: string; proId: string; tokenHash: string; deviceId: string; expiresAt: Date };
    };
    expect(row.data).toMatchObject({ jobId: 'job-1', proId: 'pro-1', deviceId: 'device-1' });
    expect(row.data.tokenHash).toHaveLength(64);

    // The FCM payload itself carried the live token and its expiry.
    expect(mockFcmSend).toHaveBeenCalledTimes(1);
    const payload = mockFcmSend.mock.calls[0][1] as FcmMessagePayload;
    expect(payload.data.jobOfferToken).toBeTruthy();
    expect(payload.data.offerExpiresAt).toBeTruthy();
    const offer = verifyJobOffer(payload.data.jobOfferToken!, OFFER_SECRET);
    expect(offer).toMatchObject({ proId: 'pro-1', jobId: 'job-1', deviceId: 'device-1' });
    // The token's expiry is floored to whole seconds; the payload keeps ms.
    expect(
      Math.abs(Date.parse(payload.data.offerExpiresAt!) - offer!.expiresAt.getTime()),
    ).toBeLessThan(1000);
  });

  it('never mints when JOB_OFFER_SECRET is unset, and the payload carries no token', async () => {
    const { service, jobOfferCreate } = mintService({ jobOfferSecret: null });

    await service.alertEligiblePros([{ proId: 'pro-1' }], info);

    expect(jobOfferCreate).not.toHaveBeenCalled();
    const payload = mockFcmSend.mock.calls[0][1] as FcmMessagePayload;
    expect(payload.data.jobOfferToken).toBeUndefined();
  });

  it('never mints an EXPO push — the native overlay is Android-only', async () => {
    const { service, jobOfferCreate, proProfileFindMany } = mintService({
      jobOfferSecret: OFFER_SECRET,
    });
    proProfileFindMany.mockResolvedValue([
      {
        id: 'pro-1',
        pushToken: 'ExponentPushToken[abc]',
        pushPlatform: 'IOS',
        pushProvider: 'EXPO',
        pushDeviceId: null,
        jobAlertsEnabled: true,
      },
    ]);

    await service.alertEligiblePros([{ proId: 'pro-1' }], info);

    expect(jobOfferCreate).not.toHaveBeenCalled();
  });

  it('still delivers the alert when a ledger write fails', async () => {
    const { service, jobOfferCreate } = mintService({ jobOfferSecret: OFFER_SECRET });
    jobOfferCreate.mockRejectedValueOnce(new Error('write failed'));

    await expect(service.alertEligiblePros([{ proId: 'pro-1' }], info)).resolves.toBeUndefined();
    expect(mockFcmSend).toHaveBeenCalledTimes(1);
  });
});

describe('buildPushMessage', () => {
  const message = {
    title: 'Electrical job nearby',
    body: 'Fix the switch near the door — ₹150.00. Tap to see and accept.',
    data: { type: 'NEW_JOB', jobId: 'job-1', kind: NotificationKind.JOB_ALERT },
    channelId: 'incoming_jobs',
  };

  it('sends Android job alerts with a display payload so a closed (process-dead) app still shows the alert', () => {
    const payload = buildPushMessage('ExponentPushToken[abc]', message, 'ANDROID');

    expect(payload.title).toBe(message.title);
    expect(payload.body).toBe(message.body);
    expect(payload.channelId).toBe('incoming_jobs');
    expect(payload.sound).toBe('default');
    expect(payload.priority).toBe('high');
    expect(payload.data).toEqual({
      type: 'NEW_JOB',
      jobId: 'job-1',
      kind: NotificationKind.JOB_ALERT,
      title: message.title,
      body: message.body,
    });
  });

  it('keeps a display payload on iOS so a closed app still shows an alert', () => {
    const payload = buildPushMessage('ExponentPushToken[abc]', message, 'IOS');

    expect(payload.title).toBe(message.title);
    expect(payload.body).toBe(message.body);
    expect(payload.channelId).toBe('incoming_jobs');
    expect(payload.interruptionLevel).toBe('time-sensitive');
  });

  it('falls back to a display payload when the platform is unknown', () => {
    const payload = buildPushMessage('ExponentPushToken[abc]', message, null);

    expect(payload.title).toBe(message.title);
    expect(payload.channelId).toBe('incoming_jobs');
  });
});

describe('buildFcmPushMessage', () => {
  const message = {
    title: 'Electrical job nearby',
    body: 'Fix the switch near the door — ₹150.00. Tap to see and accept.',
    data: { type: 'NEW_JOB', jobId: 'job-1', amountPaise: 15_000 },
    channelId: 'incoming_jobs',
  };

  it('carries string data, is data-only (so onMessageReceived runs), high priority and a per-job ttl/collapse', () => {
    const payload = buildFcmPushMessage(message, { ttlMs: 60_000, collapseKey: 'job-1' });

    expect(payload.data).toEqual({
      type: 'NEW_JOB',
      jobId: 'job-1',
      amountPaise: '15000',
    });
    // A display `notification` block would make firebase-messaging render the
    // tray entry itself and never call onMessageReceived — the native overlay
    // depends on it being data-only.
    expect(payload.notification).toBeUndefined();
    expect(payload.android).toEqual({
      priority: 'high',
      ttl: '60s',
      collapseKey: 'job-1',
    });
  });
});

describe('buildFcmTerminalMessage', () => {
  it('sends a data-only message that only names the terminal event and the job', () => {
    const payload = buildFcmTerminalMessage('JOB_ACCEPTED', 'job-1');

    expect(payload.data).toEqual({ type: 'JOB_ACCEPTED', jobId: 'job-1' });
    expect(payload.notification).toBeUndefined();
    expect(payload.android).toBeUndefined();
  });
});

describe('createNotificationsService.registerPushToken', () => {
  const TOKEN = 'raw-fcm-token';
  const CLEAR = { pushToken: null, pushPlatform: null, pushProvider: null };

  function build() {
    const proProfileUpsert = jest.fn().mockResolvedValue({ id: 'pro-row' });
    const customerProfileUpsert = jest.fn().mockResolvedValue({ id: 'cust-row' });
    const prisma = {
      proProfile: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: proProfileUpsert,
      },
      customerProfile: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: customerProfileUpsert,
      },
    };

    const service = createNotificationsService({
      prisma: prisma as never,
      config: { expoAccessToken: null } as never,
    });

    return { service, prisma };
  }

  it('stores on the customer profile for the customer surface, dropping any same-token pro copy', async () => {
    const { service, prisma } = build();

    await service.registerPushToken('user-1', 'customer', TOKEN, 'android', 'fcm');

    expect(prisma.customerProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', pushToken: TOKEN, pushPlatform: 'ANDROID', pushProvider: 'FCM' },
      update: { pushToken: TOKEN, pushPlatform: 'ANDROID', pushProvider: 'FCM' },
    });
    // Self-heal: no token on the same account's pro surface.
    expect(prisma.proProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', pushToken: TOKEN },
      data: CLEAR,
    });
    // And the older cross-account clear for uniqueness still runs.
    expect(prisma.customerProfile.updateMany).toHaveBeenCalledWith({
      where: { pushToken: TOKEN, userId: { not: 'user-1' } },
      data: CLEAR,
    });
    expect(prisma.proProfile.upsert).not.toHaveBeenCalled();
  });

  it('stores on the pro profile for the pro surface, keeping the device binding', async () => {
    const { service, prisma } = build();

    await service.registerPushToken('user-1', 'pro', TOKEN, 'android', 'fcm', 'device-9');

    expect(prisma.proProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        pushToken: TOKEN,
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        pushDeviceId: 'device-9',
      },
      update: {
        pushToken: TOKEN,
        pushPlatform: 'ANDROID',
        pushProvider: 'FCM',
        pushDeviceId: 'device-9',
      },
    });
    expect(prisma.customerProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', pushToken: TOKEN },
      data: CLEAR,
    });
    expect(prisma.customerProfile.upsert).not.toHaveBeenCalled();
  });

  it('keeps the pro registration on the pro row even when the same account also has a customer profile', async () => {
    const { service, prisma } = build();

    // An account that is *both* a pro and a customer (one phone number, two
    // surface rows) must still register by the surface that called. Previously
    // the presence of the customer profile hijacked the pro phone's token.
    await service.registerPushToken('user-1', 'pro', TOKEN, 'android', 'fcm');

    expect(prisma.proProfile.upsert).toHaveBeenCalled();
    expect(prisma.customerProfile.upsert).not.toHaveBeenCalled();
  });
});

describe('createNotificationsService.sendChatPush', () => {
  function chatMessage(): ChatMessage {
    return {
      id: 'msg-1',
      jobId: 'job-1',
      senderId: 'sender-1',
      senderRole: 'CUSTOMER',
      content: 'On my way',
      sentAt: '2026-09-07T15:00:00.000Z',
      deliveredAt: null,
      readAt: null,
    };
  }

  function build() {
    const prisma = {
      proProfile: {
        findUnique: jest.fn().mockResolvedValue({
          pushToken: 'pro-tok',
          pushPlatform: 'ANDROID',
          pushProvider: 'FCM',
        }),
      },
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          pushToken: 'cust-tok',
          pushPlatform: 'ANDROID',
          pushProvider: 'FCM',
        }),
      },
    };

    const service = createNotificationsService({
      prisma: prisma as never,
      config: {
        expoAccessToken: null,
        fcmProjectId: 'samona',
        fcmClientEmail: 'x@samona',
        fcmPrivateKey: 'key',
      } as never,
    });

    return { service, prisma };
  }

  it('delivers to the customer row when the recipient is the customer side, even if the same user is also a pro', async () => {
    mockFcmSend.mockClear();
    mockFcmSend.mockResolvedValue({ ok: true });
    const { service, prisma } = build();

    // The same person is both surfaces on two phones: pro-tok lives on the pro
    // row (their pro phone) and cust-tok on the customer row (their customer
    // phone). A message TO the customer side must ring the customer phone.
    await service.sendChatPush({
      userId: 'user-1',
      jobId: 'job-1',
      senderName: 'Ana',
      message: chatMessage(),
      recipientIsCustomer: true,
    });

    expect(prisma.customerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { pushToken: true, pushPlatform: true, pushProvider: true },
    });
    expect(prisma.proProfile.findUnique).not.toHaveBeenCalled();
    expect(mockFcmSend).toHaveBeenCalledTimes(1);
    const [sentToken, payload] = mockFcmSend.mock.calls[0] as [
      string,
      { notification: unknown; android: { notification: { channelId: string } } },
    ];
    expect(sentToken).toBe('cust-tok');
    expect(payload.notification).toEqual({ title: 'Ana', body: 'On my way' });
    expect(payload.android.notification.channelId).toBe('chat_messages_v2');
  });

  it('does nothing when the recipient-side profile holds no token', async () => {
    mockFcmSend.mockClear();
    const { service, prisma } = build();
    prisma.customerProfile.findUnique.mockResolvedValue({
      pushToken: null,
      pushPlatform: null,
      pushProvider: null,
    });

    await service.sendChatPush({
      userId: 'user-1',
      jobId: 'job-1',
      senderName: 'Ana',
      message: chatMessage(),
      recipientIsCustomer: true,
    });

    expect(mockFcmSend).not.toHaveBeenCalled();
  });
});

describe('createNotificationsService.sendCustomerPush', () => {
  function build() {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          pushToken: 'cust-tok',
          pushPlatform: 'ANDROID',
          pushProvider: 'FCM',
        }),
      },
    };

    const service = createNotificationsService({
      prisma: prisma as never,
      config: {
        expoAccessToken: null,
        fcmProjectId: 'samona',
        fcmClientEmail: 'x@samona',
        fcmPrivateKey: 'key',
      } as never,
    });

    return { service, prisma };
  }

  it('pushes the start-work code on the job_otp channel to the customer row', async () => {
    mockFcmSend.mockClear();
    mockFcmSend.mockResolvedValue({ ok: true });
    const { service, prisma } = build();

    await service.sendCustomerPush({
      userId: 'user-1',
      jobId: 'job-1',
      title: 'Rakesh is about to start work',
      body: 'Your code to confirm: 8238',
    });

    expect(prisma.customerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { pushToken: true, pushPlatform: true, pushProvider: true },
    });
    expect(mockFcmSend).toHaveBeenCalledTimes(1);
    const [sentToken, payload] = mockFcmSend.mock.calls[0] as [
      string,
      { data: Record<string, string>; notification: { title: string; body: string }; android: { notification: { channelId: string } } },
    ];
    expect(sentToken).toBe('cust-tok');
    expect(payload.data).toMatchObject({ type: 'JOB_OTP', jobId: 'job-1', title: 'Rakesh is about to start work', body: 'Your code to confirm: 8238' });
    expect(payload.android.notification.channelId).toBe('job_otp');
  });

  it('silently skips a customer with no registered push token', async () => {
    mockFcmSend.mockClear();
    const { service, prisma } = build();
    prisma.customerProfile.findUnique.mockResolvedValue({
      pushToken: null,
      pushPlatform: null,
      pushProvider: null,
    });

    await service.sendCustomerPush({
      userId: 'user-1',
      jobId: 'job-1',
      title: 'Rakesh is about to start work',
      body: 'Your code to confirm: 8238',
    });

    expect(mockFcmSend).not.toHaveBeenCalled();
  });

  it('pushes a job-status update on the job_updates channel with its own data type', async () => {
    mockFcmSend.mockClear();
    mockFcmSend.mockResolvedValue({ ok: true });
    const { service } = build();

    await service.sendCustomerPush({
      userId: 'user-1',
      jobId: 'job-1',
      title: 'Booking accepted',
      body: 'Rakesh · Electrical',
      type: 'JOB_STATUS',
    });

    const [sentToken, payload] = mockFcmSend.mock.calls[0] as [
      string,
      { data: Record<string, string>; notification: { title: string; body: string }; android: { notification: { channelId: string } } },
    ];
    expect(sentToken).toBe('cust-tok');
    expect(payload.data).toMatchObject({
      type: 'JOB_STATUS',
      jobId: 'job-1',
      title: 'Booking accepted',
      body: 'Rakesh · Electrical',
    });
    expect(payload.android.notification.channelId).toBe('job_updates');
  });
});

describe('createNotificationsService customer notices', () => {
  const createdAt = new Date('2026-09-08T08:00:00.000Z');

  it('records a notice and nudges the customer bell over the socket', async () => {
    const customerProfileFindUnique = jest.fn().mockResolvedValue({ id: 'cust-1' });
    const create = jest.fn().mockResolvedValue({
      id: 'notif-1',
      customerId: 'cust-1',
      jobId: 'job-1',
      kind: NotificationKind.JOB_STATUS,
      title: 'Rakesh accepted your booking',
      body: 'You can now chat with Rakesh about Electrical.',
      route: '/booking/job-1',
      readAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      customerProfile: { findUnique: customerProfileFindUnique },
      customerNotification: { create, count, findMany: jest.fn(), updateMany: jest.fn() },
    };
    const emitToUser = jest.fn();
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
      realtime: { emitToUser } as never,
    });

    const dto = await service.recordCustomerNotification({
      customerId: 'cust-1',
      customerUserId: 'user-1',
      jobId: 'job-1',
      kind: NotificationKind.JOB_STATUS,
      title: 'Rakesh accepted your booking',
      body: 'You can now chat with Rakesh about Electrical.',
      route: '/booking/job-1',
    });

    expect(prisma.customerNotification.create).toHaveBeenCalledWith({
      data: {
        customerId: 'cust-1',
        jobId: 'job-1',
        kind: NotificationKind.JOB_STATUS,
        title: 'Rakesh accepted your booking',
        body: 'You can now chat with Rakesh about Electrical.',
        route: '/booking/job-1',
      },
    });
    expect(prisma.customerNotification.count).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', readAt: null },
    });
    expect(emitToUser).toHaveBeenCalledWith('user-1', REALTIME_EVENTS.NOTIFICATION_UNREAD, {
      unreadCount: 1,
    });
    expect(dto).toEqual({
      id: 'notif-1',
      jobId: 'job-1',
      kind: NotificationKind.JOB_STATUS,
      title: 'Rakesh accepted your booking',
      body: 'You can now chat with Rakesh about Electrical.',
      route: '/booking/job-1',
      readAt: null,
      createdAt: '2026-09-08T08:00:00.000Z',
    });
  });

  it('lists only the caller’s own notices, newest first', async () => {
    const customerProfileFindUnique = jest.fn().mockResolvedValue({ id: 'cust-1' });
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'n2',
        customerId: 'cust-1',
        jobId: null,
        kind: NotificationKind.SYSTEM,
        title: 'Welcome',
        body: 'Happy to have you.',
        route: null,
        readAt: new Date(),
        createdAt,
      },
    ]);
    const prisma = {
      customerProfile: { findUnique: customerProfileFindUnique },
      customerNotification: {
        create: jest.fn(),
        count: jest.fn(),
        findMany,
        updateMany: jest.fn(),
      },
    };
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
    });

    const result = await service.listForCustomer('user-1', { limit: 10 });

    expect(prisma.customerNotification.findMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'n2', jobId: null, readAt: expect.any(String) });
  });

  it('counts unread notices for the bell pill', async () => {
    const customerProfileFindUnique = jest.fn().mockResolvedValue({ id: 'cust-1' });
    const count = jest.fn().mockResolvedValue(3);
    const prisma = {
      customerProfile: { findUnique: customerProfileFindUnique },
      customerNotification: {
        create: jest.fn(),
        count,
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
    });

    await expect(service.countUnreadForCustomer('user-1')).resolves.toBe(3);
    expect(prisma.customerNotification.count).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', readAt: null },
    });
  });

  it('marks a notice read and pushes the fresh count', async () => {
    const customerProfileFindUnique = jest.fn().mockResolvedValue({ id: 'cust-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      customerProfile: { findUnique: customerProfileFindUnique },
      customerNotification: { create: jest.fn(), count, findMany: jest.fn(), updateMany },
    };
    const emitToUser = jest.fn();
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
      realtime: { emitToUser } as never,
    });

    await expect(
      service.markCustomerNotificationRead('user-1', 'notif-1'),
    ).resolves.toBeUndefined();

    expect(prisma.customerNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', customer: { userId: 'user-1' } },
      data: { readAt: expect.any(Date) },
    });
    expect(emitToUser).toHaveBeenCalledWith('user-1', REALTIME_EVENTS.NOTIFICATION_UNREAD, {
      unreadCount: 0,
    });
  });

  it('404s when marking someone else’s notice read', async () => {
    const customerProfileFindUnique = jest.fn().mockResolvedValue({ id: 'cust-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      customerProfile: { findUnique: customerProfileFindUnique },
      customerNotification: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        updateMany,
      },
    };
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
    });

    await expect(service.markCustomerNotificationRead('user-1', 'notif-9')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('marks every unread notice read and pushes the fresh count', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      customerProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      customerNotification: { create: jest.fn(), count, findMany: jest.fn(), updateMany },
    };
    const emitToUser = jest.fn();
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
      realtime: { emitToUser } as never,
    });

    await expect(service.markAllCustomerNotificationsRead('user-1')).resolves.toBeUndefined();

    expect(prisma.customerNotification.updateMany).toHaveBeenCalledWith({
      where: { customer: { userId: 'user-1' }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(emitToUser).toHaveBeenCalledWith('user-1', REALTIME_EVENTS.NOTIFICATION_UNREAD, {
      unreadCount: 0,
    });
  });

  it('deletes selected notices scoped to the caller and pushes the fresh count', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      customerProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      customerNotification: {
        create: jest.fn(),
        count,
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany,
      },
    };
    const emitToUser = jest.fn();
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
      realtime: { emitToUser } as never,
    });

    await expect(
      service.deleteCustomerNotifications('user-1', ['notif-1', 'notif-2']),
    ).resolves.toBeUndefined();

    expect(prisma.customerNotification.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', id: { in: ['notif-1', 'notif-2'] } },
    });
    expect(emitToUser).toHaveBeenCalledWith('user-1', REALTIME_EVENTS.NOTIFICATION_UNREAD, {
      unreadCount: 0,
    });
  });

  it('deletes nothing and still reconciles the pill for an account with no profile', async () => {
    const deleteMany = jest.fn();
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      customerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      customerNotification: {
        create: jest.fn(),
        count,
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany,
      },
    };
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
    });

    await expect(
      service.deleteCustomerNotifications('user-1', ['notif-1']),
    ).resolves.toBeUndefined();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('returns an empty list and a zero count for an account with no profile', async () => {
    const customerProfileFindUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      customerProfile: { findUnique: customerProfileFindUnique },
      customerNotification: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const service = createNotificationsService({
      prisma: prisma as never,
      config: {} as never,
    });

    await expect(service.listForCustomer('user-1')).resolves.toEqual([]);
    await expect(service.countUnreadForCustomer('user-1')).resolves.toBe(0);
  });
});

import { createNotificationsService } from './notifications.service';
import { verifyJobOffer } from '../jobs/job-offers';
import { logger } from '../common/logger';

const mockSend = jest.fn();
jest.mock('./fcm', () => ({
  ...jest.requireActual('./fcm'),
  createFcmClient: () => ({ send: mockSend }),
}));

const secret = 'test-job-offer-secret-at-least-32-characters';
const info = {
  jobId: 'job-1',
  serviceName: 'Electrical',
  serviceCategory: 'Wiring',
  customSkill: null,
  description: 'Fix a switch',
  basePayPaise: 15000,
  address: 'Market Rd',
  expiresAt: null,
};
const device = (token: string, deviceId: string) => ({
  pushToken: token,
  deviceId,
  pushPlatform: 'ANDROID',
  pushProvider: 'FCM',
});

function build() {
  const pro = {
    id: 'pro-1',
    userId: 'user-1',
    jobAlertsEnabled: true,
    pushToken: 'token-b',
    pushPlatform: 'ANDROID',
    pushProvider: 'FCM',
    pushDeviceId: 'device-b',
    pushDevices: [device('token-a', 'device-a'), device('token-b', 'device-b')],
  };
  const prisma = {
    proProfile: {
      findMany: jest.fn().mockResolvedValue([pro]),
      findUnique: jest.fn().mockResolvedValue(pro),
      upsert: jest.fn().mockResolvedValue(pro),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    customerProfile: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    proPushDevice: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ pro }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    jobOffer: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const service = createNotificationsService({
    prisma: prisma as never,
    config: {
      fcmProjectId: 'samona-test',
      fcmClientEmail: 'test@example.com',
      fcmPrivateKey: 'key',
      expoAccessToken: null,
      jobAlertTtlMs: 60000,
      jobOfferTtlMs: 90000,
      jobOfferSecret: secret,
      jobExpireTtlMs: 120000,
    } as never,
  });
  return { service, prisma, pro };
}

describe('Pro push devices', () => {
  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({ ok: true });
  });

  it('alerts every device with its own redeemable offer and records one notification per Pro', async () => {
    const { service, prisma } = build();
    await service.alertEligiblePros([{ proId: 'pro-1' }], info);
    expect(mockSend.mock.calls.map(([token]) => token).sort()).toEqual(['token-a', 'token-b']);
    for (const [token, payload] of mockSend.mock.calls) {
      expect(verifyJobOffer(payload.data.jobOfferToken, secret)?.deviceId).toBe(
        token === 'token-a' ? 'device-a' : 'device-b',
      );
    }
    expect(prisma.notification.upsert).toHaveBeenCalledTimes(1);
  });

  it('deletes exactly the UNREGISTERED token, keeps other devices, and does not resend it', async () => {
    const { service, prisma } = build();
    mockSend.mockImplementation(async (token: string) =>
      token === 'token-a'
        ? { ok: false, errorCode: 'UNREGISTERED', invalidToken: true }
        : { ok: true },
    );
    await service.alertEligiblePros([{ proId: 'pro-1' }], info);
    expect(prisma.proPushDevice.deleteMany).toHaveBeenCalledWith({
      where: { pushToken: 'token-a' },
    });
    expect(prisma.proProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pushToken: 'token-a' },
      }),
    );
    // Another already-loaded alert may still carry the rejected token.
    await service.alertEligiblePros([{ proId: 'pro-1' }], { ...info, jobId: 'job-2' });
    expect(mockSend.mock.calls.filter(([token]) => token === 'token-a')).toHaveLength(1);
    expect(mockSend.mock.calls.filter(([token]) => token === 'token-b')).toHaveLength(2);
  });

  it('does not remove devices for transient or configuration delivery errors', async () => {
    const { service, prisma } = build();
    mockSend.mockResolvedValue({ ok: false, errorCode: 'UNAVAILABLE' });
    await service.alertEligiblePros([{ proId: 'pro-1' }], info);
    expect(prisma.proPushDevice.deleteMany).not.toHaveBeenCalled();
    expect(prisma.proProfile.updateMany).not.toHaveBeenCalled();
  });

  it('updates the registering install without deleting another device of the same Pro', async () => {
    const { service, prisma } = build();
    await service.registerPushToken(
      'user-1',
      'pro',
      'token-refreshed',
      'android',
      'fcm',
      'device-a',
    );
    expect(prisma.proPushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deviceId: 'device-a' },
        create: expect.objectContaining({
          proId: 'pro-1',
          deviceId: 'device-a',
          pushToken: 'token-refreshed',
        }),
        update: expect.objectContaining({ proId: 'pro-1', pushToken: 'token-refreshed' }),
      }),
    );
    expect(prisma.proPushDevice.deleteMany).not.toHaveBeenCalledWith({ where: { proId: 'pro-1' } });
  });

  it('does not expose raw registration tokens when a database operation fails', async () => {
    const { service, prisma } = build();
    prisma.proPushDevice.upsert.mockRejectedValueOnce(
      new Error('query failed: token-refreshed-private-value'),
    );
    await expect(
      service.registerPushToken(
        'user-1',
        'pro',
        'token-refreshed-private-value',
        'android',
        'fcm',
        'device-a',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('does not report a registered device when the transaction commit fails', async () => {
    const { service, prisma } = build();
    const infoLog = jest.spyOn(logger, 'info').mockImplementation();
    const warningLog = jest.spyOn(logger, 'warn').mockImplementation();
    prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      await fn(prisma);
      throw Object.assign(new Error('commit failed with private-registration-token'), {
        code: 'P2028',
        meta: { query: 'private-registration-token' },
      });
    });
    try {
      await expect(
        service.registerPushToken(
          'user-1',
          'pro',
          'private-registration-token',
          'android',
          'fcm',
          'device-a',
        ),
      ).rejects.toMatchObject({ status: 503 });
      expect(infoLog.mock.calls.some(([message]) => message.includes('Registered pro'))).toBe(
        false,
      );
      expect(warningLog).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          code: 'P2028',
          operation: 'register',
          elapsedMs: expect.any(Number),
        }),
      );
      expect(JSON.stringify(warningLog.mock.calls)).not.toContain('private-registration-token');
    } finally {
      infoLog.mockRestore();
      warningLog.mockRestore();
    }
  });

  it('sends terminal events to all devices so every overlay stops', async () => {
    const { service } = build();
    await service.resolveJobAlerts('job-1', 'ACCEPTED');
    expect(mockSend.mock.calls.map(([token]) => token).sort()).toEqual(['token-a', 'token-b']);
    expect(mockSend.mock.calls[0][1].data.type).toBe('JOB_ACCEPTED');
  });

  it('scopes logout cleanup to the authenticated Pro and this device', async () => {
    const { service, prisma } = build();
    await service.unregisterPushToken('user-1', 'pro', { deviceId: 'device-a' });
    expect(prisma.proPushDevice.deleteMany).toHaveBeenCalledWith({
      where: { pro: { userId: 'user-1' }, deviceId: 'device-a' },
    });
    expect(prisma.proProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', pushDeviceId: 'device-a' },
      data: { pushToken: null, pushPlatform: null, pushProvider: null, pushDeviceId: null },
    });
  });

  it('refuses logout cleanup without a device or token selector', async () => {
    const { service, prisma } = build();
    await expect(service.unregisterPushToken('user-1', 'pro', {})).rejects.toThrow();
    expect(prisma.proPushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it('sends assigned-cancellation alerts to every device', async () => {
    const { service } = build();
    await service.sendAssignedCancellationProPush('user-1', 'job-1', new Date());
    expect(mockSend.mock.calls.map(([token]) => token).sort()).toEqual(['token-a', 'token-b']);
    expect(mockSend.mock.calls[0][1].data.type).toBe('JOB_CANCELLED_ASSIGNED');
  });

  it('sends chat to remaining devices even when the legacy mirror has been cleared', async () => {
    const { service, pro } = build();
    pro.pushToken = null as never;
    await service.sendChatPush({
      userId: 'user-1',
      jobId: 'job-1',
      recipientIsCustomer: false,
      senderName: 'Ana',
      message: { id: 'message-1', content: 'On my way', senderId: 'customer-1' } as never,
    });
    expect(mockSend.mock.calls.map(([token]) => token).sort()).toEqual(['token-a', 'token-b']);
    expect(mockSend.mock.calls[0][1].android.notification.channelId).toBe('chat_messages_v2');
  });
});

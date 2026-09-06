import { NotificationKind } from '@samona/types';
import {
  buildFcmPushMessage,
  buildFcmTerminalMessage,
  buildPushMessage,
  createNotificationsService,
} from './notifications.service';
import { verifyJobOffer } from '../jobs/job-offers';
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

  it('carries string data, a display notification, high priority and a per-job ttl/collapse/tag', () => {
    const payload = buildFcmPushMessage(message, { ttlMs: 60_000, collapseKey: 'job-1' });

    expect(payload.data).toEqual({
      type: 'NEW_JOB',
      jobId: 'job-1',
      amountPaise: '15000',
    });
    expect(payload.notification).toEqual({
      title: 'Electrical job nearby',
      body: 'Fix the switch near the door — ₹150.00. Tap to see and accept.',
    });
    expect(payload.android).toMatchObject({
      priority: 'high',
      ttl: '60s',
      collapseKey: 'job-1',
      notification: {
        channelId: 'incoming_jobs',
        sound: 'job_alert',
        tag: 'job-1',
      },
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

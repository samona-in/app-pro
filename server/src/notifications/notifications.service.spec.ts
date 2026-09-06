import { NotificationKind } from '@samona/types';
import {
  buildFcmPushMessage,
  buildFcmTerminalMessage,
  buildPushMessage,
  createNotificationsService,
} from './notifications.service';

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

import { NotificationKind } from '@samona/types';
import { createNotificationsService } from './notifications.service';

const info = {
  jobId: 'job-1',
  serviceName: 'Electrical',
  customSkill: null,
  description: 'Fix the switch near the door.',
  basePayPaise: 15_000,
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
    ctx.proProfileFindMany.mockResolvedValue([{ id: 'pro-1', pushToken: null, jobAlertsEnabled: true }]);

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
    ctx.proProfileFindMany.mockResolvedValue([{ id: 'pro-1', pushToken: 'ExponentPushToken[abc]', jobAlertsEnabled: false }]);

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
import { buildFcmPushMessage } from './notifications.service';

describe('FCM campaign presentation', () => {
  it('carries a visible title/body and the campaign channel for both Android apps', () => {
    const payload = buildFcmPushMessage(
      {
        title: 'SAMONA update',
        body: 'A new update is available',
        channelId: 'campaigns',
        data: { type: 'CAMPAIGN', campaignId: 'campaign-1', deepLink: 'samona://notifications' },
      },
      { ttlMs: 60000, collapseKey: 'campaign-1' },
    );

    // Android's system tray consumes notification + channel while backgrounded;
    // Expo's foreground handler and tap navigation consume the accompanying data.
    expect(payload.notification).toEqual({
      title: 'SAMONA update',
      body: 'A new update is available',
    });
    expect(payload.data).toMatchObject({
      type: 'CAMPAIGN',
      campaignId: 'campaign-1',
      deepLink: 'samona://notifications',
      title: 'SAMONA update',
      body: 'A new update is available',
    });
    expect(payload.android?.notification).toEqual({ channelId: 'campaigns', sound: 'default' });
  });

  it('keeps new-job messages data-only so the native Pro overlay can handle them', () => {
    const payload = buildFcmPushMessage(
      {
        title: 'Job nearby',
        body: 'Electrical repair',
        channelId: 'incoming_jobs',
        data: { type: 'NEW_JOB', jobId: 'job-1', jobOfferToken: 'signed-offer' },
      },
      { ttlMs: 60000, collapseKey: 'job-1' },
    );
    expect(payload.notification).toBeUndefined();
    expect(payload.android?.notification).toBeUndefined();
    expect(payload.data).toEqual({
      type: 'NEW_JOB',
      jobId: 'job-1',
      jobOfferToken: 'signed-offer',
    });
  });
});

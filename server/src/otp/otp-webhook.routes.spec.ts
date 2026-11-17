import express from 'express';
import request from 'supertest';
import { createHash, createHmac } from 'node:crypto';
import type { AppConfig } from '../config';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createOtpWebhookRouter } from './otp-webhook.routes';

const AUTH_TOKEN = 'test-auth-token';
const WEBHOOK_URL = 'https://api.example.com/webhooks/twilio/verify';

const body = JSON.stringify([
  {
    id: 'evt-1',
    type: 'com.twilio.accountsecurity.verify.message.delivered',
    time: '2026-11-17T10:00:00.000Z',
    data: {
      to: '+919876543210',
      channel: 'sms',
      message_status: 'DELIVERED',
      verification_sid: 'VE111',
      attempt_sid: 'VL111',
      mcc: '404',
      mnc: '45',
    },
  },
]);

function signatureFor(raw: string): { signature: string; url: string } {
  const bodySHA256 = createHash('sha256').update(raw, 'utf8').digest('hex');
  const url = `${WEBHOOK_URL}?bodySHA256=${bodySHA256}`;
  return {
    url,
    signature: createHmac('sha1', AUTH_TOKEN).update(url, 'utf8').digest('base64'),
  };
}

function buildServices(
  overrides: {
    enabled?: boolean;
    recordEvents?: jest.Mock;
    config?: Partial<AppConfig>;
  } = {},
) {
  return {
    config: {
      otpTelemetry: {
        enabled: overrides.enabled ?? true,
        twilioAuthToken: AUTH_TOKEN,
        webhookUrl: WEBHOOK_URL,
        phoneHashSecret: 'hash-secret-at-least-16',
        correlationWindowMs: 600_000,
      },
      ...overrides.config,
    },
    otpTelemetry: {
      enabled: overrides.enabled ?? true,
      recordEvents: overrides.recordEvents ?? jest.fn().mockResolvedValue({}),
      registerAttempt: jest.fn(),
    },
  } as unknown as Services;
}

function appWith(services: Services) {
  return express()
    .use('/webhooks/twilio/verify', createOtpWebhookRouter(services))
    .use(errorHandler);
}

describe('POST /webhooks/twilio/verify', () => {
  it('accepts a valid signature and forwards the raw body', async () => {
    const recordEvents = jest.fn().mockResolvedValue({});
    const { signature, url } = signatureFor(body);
    const query = url.slice(url.indexOf('?'));

    const res = await request(appWith(buildServices({ recordEvents })))
      .post(`/webhooks/twilio/verify${query}`)
      .set('Content-Type', 'application/json')
      .set('X-Twilio-Signature', signature)
      .send(body);

    expect(res.status).toBe(204);
    expect(recordEvents).toHaveBeenCalledWith(body);
  });

  it('refuses a callback with a bad signature and writes nothing', async () => {
    const recordEvents = jest.fn();
    const { url } = signatureFor(body);
    const query = url.slice(url.indexOf('?'));

    const res = await request(appWith(buildServices({ recordEvents })))
      .post(`/webhooks/twilio/verify${query}`)
      .set('Content-Type', 'application/json')
      .set('X-Twilio-Signature', 'not-a-signature')
      .send(body);

    expect(res.status).toBe(403);
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('is unavailable when telemetry is switched off', async () => {
    const recordEvents = jest.fn();
    const { signature, url } = signatureFor(body);
    const query = url.slice(url.indexOf('?'));

    const res = await request(appWith(buildServices({ enabled: false, recordEvents })))
      .post(`/webhooks/twilio/verify${query}`)
      .set('Content-Type', 'application/json')
      .set('X-Twilio-Signature', signature)
      .send(body);

    expect(res.status).toBe(503);
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('surfaces a processing failure so Twilio retries', async () => {
    const recordEvents = jest.fn().mockRejectedValue(new Error('database down'));
    const { signature, url } = signatureFor(body);
    const query = url.slice(url.indexOf('?'));

    const res = await request(appWith(buildServices({ recordEvents })))
      .post(`/webhooks/twilio/verify${query}`)
      .set('Content-Type', 'application/json')
      .set('X-Twilio-Signature', signature)
      .send(body);

    expect(res.status).toBe(500);
  });
});

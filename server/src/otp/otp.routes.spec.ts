import express from 'express';
import request from 'supertest';
import type { Services } from '../context';
import type { Limiters } from '../common';
import { errorHandler } from '../common/middleware/error-handler';
import { createOtpRouter } from './otp.routes';

const limiters = {
  write: (_req: unknown, _res: unknown, next: () => void) => next(),
} as unknown as Limiters;

const validBody = {
  phone: '+919876543210',
  app: 'pro',
  clientAttemptId: 'attempt_1712345678901_abcd1234',
  device: { manufacturer: 'vivo', model: 'I2012', osVersion: '14' },
};

function buildServices(
  overrides: {
    enabled?: boolean;
    registerAttempt?: jest.Mock;
  } = {},
) {
  return {
    otpTelemetry: {
      enabled: overrides.enabled ?? true,
      registerAttempt:
        overrides.registerAttempt ?? jest.fn().mockResolvedValue({ attemptId: 'a1' }),
      recordEvents: jest.fn(),
    },
  } as unknown as Services;
}

function appWith(services: Services) {
  return express()
    .use(express.json())
    .use('/auth', createOtpRouter(services, limiters))
    .use(errorHandler);
}

describe('POST /auth/otp-attempts', () => {
  it('registers a valid attempt and returns its id', async () => {
    const registerAttempt = jest.fn().mockResolvedValue({ attemptId: 'a1' });
    const res = await request(appWith(buildServices({ registerAttempt })))
      .post('/auth/otp-attempts')
      .send(validBody);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ attemptId: 'a1' });
    expect(registerAttempt).toHaveBeenCalledWith({
      phone: '+919876543210',
      app: 'PRO',
      clientAttemptId: validBody.clientAttemptId,
      device: validBody.device,
    });
  });

  it('maps the customer surface to CUSTOMER', async () => {
    const registerAttempt = jest.fn().mockResolvedValue({ attemptId: 'a2' });
    await request(appWith(buildServices({ registerAttempt })))
      .post('/auth/otp-attempts')
      .send({ ...validBody, app: 'customer' });

    expect(registerAttempt.mock.calls[0]?.[0]).toMatchObject({ app: 'CUSTOMER' });
  });

  it('accepts but records nothing when telemetry is off', async () => {
    const registerAttempt = jest.fn();
    const res = await request(appWith(buildServices({ enabled: false, registerAttempt })))
      .post('/auth/otp-attempts')
      .send(validBody);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ attemptId: null });
    expect(registerAttempt).not.toHaveBeenCalled();
  });

  it('rejects a number that is not E.164', async () => {
    const registerAttempt = jest.fn();
    const res = await request(appWith(buildServices({ registerAttempt })))
      .post('/auth/otp-attempts')
      .send({ ...validBody, phone: '09876543210' });

    expect(res.status).toBe(422);
    expect(registerAttempt).not.toHaveBeenCalled();
  });

  it('rejects an unsupported client attempt id', async () => {
    const res = await request(appWith(buildServices()))
      .post('/auth/otp-attempts')
      .send({ ...validBody, clientAttemptId: 'bad id with spaces' });

    expect(res.status).toBe(422);
  });
});

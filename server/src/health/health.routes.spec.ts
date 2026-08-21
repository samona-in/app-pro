import request from 'supertest';
import express from 'express';
import { createHealthRouter } from './health.routes';

describe('health routes', () => {
  const app = express().use('/health', createHealthRouter());

  it('reports ok', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(response.body.timestamp).toISOString()).not.toThrow();
  });
});

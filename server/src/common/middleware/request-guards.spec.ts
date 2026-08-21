import express from 'express';
import request from 'supertest';
import { logger } from '../logger';
import { errorHandler } from './error-handler';
import { blockPrototypePollution, enforceJsonContentType, limitJsonShape } from './request-guards';

beforeEach(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function guardedApp() {
  return express()
    .use(enforceJsonContentType)
    .use(express.json({ limit: '100kb' }))
    .use(blockPrototypePollution)
    .use(limitJsonShape(5, 50))
    .post('/thing', (_req, res) => {
      res.json({ ok: true });
    })
    .get('/thing', (_req, res) => {
      res.json({ ok: true });
    })
    .use(errorHandler);
}

describe('enforceJsonContentType', () => {
  it('accepts application/json writes', async () => {
    await request(guardedApp()).post('/thing').send({ a: 1 }).expect(200);
  });

  it('rejects form-encoded writes with 415', async () => {
    // A cross-origin HTML form can only send this content type; refusing it
    // keeps the API off the list of CSRF-reachable endpoints.
    const response = await request(guardedApp())
      .post('/thing')
      .type('form')
      .send('a=1')
      .expect(415);

    expect(response.body.error.message).toContain('application/json');
  });

  it('leaves reads alone', async () => {
    await request(guardedApp()).get('/thing').expect(200);
  });
});

describe('blockPrototypePollution', () => {
  it('rejects a __proto__ key', async () => {
    const response = await request(guardedApp())
      .post('/thing')
      .set('content-type', 'application/json')
      .send('{"__proto__":{"admin":true}}')
      .expect(400);

    expect(response.body.error.message).toContain('disallowed field name');
  });

  it('rejects a nested constructor key', async () => {
    await request(guardedApp())
      .post('/thing')
      .set('content-type', 'application/json')
      .send('{"profile":{"constructor":{"x":1}}}')
      .expect(400);
  });

  it('does not corrupt Object.prototype in the process', async () => {
    await request(guardedApp())
      .post('/thing')
      .set('content-type', 'application/json')
      .send('{"__proto__":{"polluted":"yes"}}');

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('limitJsonShape', () => {
  it('rejects a body nested past the depth limit', async () => {
    // Small in bytes, expensive downstream — exactly what a size limit misses.
    let payload = '{"a":1}';
    for (let i = 0; i < 12; i += 1) payload = `{"a":${payload}}`;

    const response = await request(guardedApp())
      .post('/thing')
      .set('content-type', 'application/json')
      .send(payload)
      .expect(400);

    expect(response.body.error.message).toContain('nested too deeply');
  });

  it('rejects a body with too many fields', async () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 200; i += 1) wide[`field${i}`] = i;

    const response = await request(guardedApp()).post('/thing').send(wide).expect(400);

    expect(response.body.error.message).toContain('too many fields');
  });

  it('accepts an ordinary payload', async () => {
    await request(guardedApp())
      .post('/thing')
      .send({ fullName: 'A Pro', location: { latitude: 12.9, longitude: 77.6 } })
      .expect(200);
  });
});

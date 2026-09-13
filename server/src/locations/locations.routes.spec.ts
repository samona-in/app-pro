import request from 'supertest';
import express from 'express';
import { ApiErrorCode, type AddressSuggestion } from '@samona/types';
import type { Services } from '../context';
import { createHttpError } from '../common/errors';
import { errorHandler } from '../common/middleware/error-handler';
import { createLocationsRouter } from './locations.routes';

const activeUser = {
  id: 'user-1',
  appType: 'pro' as const,
  isAdmin: false,
  phone: '+919876543210',
  email: null,
  fullName: null,
  isActive: true,
  createdAt: new Date(),
};

const suggestion: AddressSuggestion = {
  formattedAddress: 'Benz Circle, Vijayawada, Andhra Pradesh, 520010',
  mainLabel: 'Benz Circle',
  secondary: 'Vijayawada, Andhra Pradesh, 520010',
  locality: null,
  city: 'Vijayawada',
  state: 'Andhra Pradesh',
  postalCode: '520010',
  latitude: 16.51,
  longitude: 80.64,
};

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: activeUser.id, phone: activeUser.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(activeUser) },
    locations: {
      searchAddresses: jest.fn().mockResolvedValue([suggestion]),
      reverseGeocode: jest.fn().mockResolvedValue(suggestion),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express()
    .use(express.json())
    .use('/locations', createLocationsRouter(services))
    .use(errorHandler);
}

describe('locations routes', () => {
  it('GET /locations/search returns normalized suggestions', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .get('/locations/search')
      .query({ q: 'benz circle' })
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(services.locations.searchAddresses).toHaveBeenCalledWith('benz circle', 6);
    expect(response.body.data).toEqual([suggestion]);
  });

  it('GET /locations/reverse returns the place for a coordinate', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .get('/locations/reverse')
      .query({ latitude: 16.51, longitude: 80.64 })
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(services.locations.reverseGeocode).toHaveBeenCalledWith(16.51, 80.64);
    expect(response.body.data).toEqual(suggestion);
  });

  it('rejects a too-short search query', async () => {
    const response = await request(appWith(buildServices()))
      .get('/locations/search')
      .query({ q: 'a' })
      .set('authorization', 'Bearer good.token')
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
  });

  it('rejects malformed coordinates', async () => {
    const response = await request(appWith(buildServices()))
      .get('/locations/reverse')
      .query({ latitude: 'north' })
      .set('authorization', 'Bearer good.token')
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
  });

  it('surfaces provider failures as a 502', async () => {
    const services = buildServices({
      locations: {
        searchAddresses: jest.fn().mockRejectedValue(
          createHttpError(502, ApiErrorCode.INTERNAL, 'down'),
        ),
        reverseGeocode: jest.fn(),
      },
    });

    const response = await request(appWith(services))
      .get('/locations/search')
      .query({ q: 'benz circle' })
      .set('authorization', 'Bearer good.token')
      .expect(502);

    expect(response.body.error.code).toBe(ApiErrorCode.INTERNAL);
  });

  it('requires a valid session', async () => {
    await request(appWith(buildServices())).get('/locations/search').query({ q: 'benz' }).expect(401);
  });
});
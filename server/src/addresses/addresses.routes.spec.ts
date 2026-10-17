import request from 'supertest';
import express from 'express';
import { ApiErrorCode, AddressLabel, type SavedAddress } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createAddressesRouter } from './addresses.routes';

const activeUser = {
  id: 'user-1',
  appType: 'customer' as const,
  isAdmin: false,
  phone: '+919876543210',
  email: null,
  fullName: null,
  isActive: true,
  createdAt: new Date(),
};

const saved: SavedAddress = {
  id: 'uuid-address-1',
  name: 'Aveen’s home',
  label: AddressLabel.HOME,
  addressLine1: '7-4A, Benz Circle',
  addressLine2: '',
  landmark: null,
  locality: null,
  city: 'Vijayawada',
  state: 'Andhra Pradesh',
  postalCode: '520010',
  latitude: 16.51,
  longitude: 80.64,
  placeId: null,
  isDefault: true,
  createdAt: '2026-09-12T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
};

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: activeUser.id, phone: activeUser.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(activeUser) },
    addresses: {
      listForUser: jest.fn().mockResolvedValue([saved]),
      create: jest.fn().mockResolvedValue(saved),
      update: jest.fn().mockResolvedValue(saved),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express()
    .use(express.json())
    .use('/addresses', createAddressesRouter(services))
    .use(errorHandler);
}

describe('addresses routes', () => {
  it('GET /addresses lists the caller’s saved addresses', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .get('/addresses')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(services.addresses.listForUser).toHaveBeenCalledWith('user-1');
    expect(response.body.data).toEqual([saved]);
  });

  it('POST /addresses creates and returns the saved address', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/addresses')
      .set('authorization', 'Bearer good.token')
      .send({
        name: 'Aveen’s home',
        label: 'HOME',
        addressLine1: '7-4A, Benz Circle',
        city: 'Vijayawada',
        coordinates: { latitude: 16.51, longitude: 80.64 },
      })
      .expect(201);

    expect(services.addresses.create).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(response.body.id).toBe(saved.id);
  });

  it('PATCH /addresses/:id updates a saved address', async () => {
    const services = buildServices();
    await request(appWith(services))
      .patch('/addresses/uuid-address-1')
      .set('authorization', 'Bearer good.token')
      .send({ isDefault: true })
      .expect(200);

    expect(services.addresses.update).toHaveBeenCalledWith(
      'user-1',
      'uuid-address-1',
      expect.objectContaining({ isDefault: true }),
    );
  });

  it('DELETE /addresses/:id removes a saved address', async () => {
    const services = buildServices();
    await request(appWith(services))
      .delete('/addresses/uuid-address-1')
      .set('authorization', 'Bearer good.token')
      .expect(204);

    expect(services.addresses.remove).toHaveBeenCalledWith('user-1', 'uuid-address-1');
  });

  it('rejects a create payload missing coordinates', async () => {
    const response = await request(appWith(buildServices()))
      .post('/addresses')
      .set('authorization', 'Bearer good.token')
      .send({ label: 'HOME', addressLine1: 'Nowhere' })
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
  });

  it('rejects a pro surface user from customer-owned address routes', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
    });

    await request(appWith(services)).get('/addresses').set('authorization', 'Bearer good.token').expect(403);
  });

  it('requires a valid session', async () => {
    await request(appWith(buildServices())).get('/addresses').expect(401);
  });
});
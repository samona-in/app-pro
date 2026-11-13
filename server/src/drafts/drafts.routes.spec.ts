import request from 'supertest';
import express from 'express';
import { ApiErrorCode, JOB_ITEMS_LIMIT } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createDraftsRouter } from './drafts.routes';

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

const draft = {
  description: 'Fix the door',
  imagePaths: ['jobs/user-1/photo.jpg'],
  imageUrls: ['https://cdn/jobs/user-1/photo.jpg'],
  estimatedTotalPaise: 21_000,
  groups: [
    {
      id: 'draft-1',
      service: { id: 'svc-1', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' },
      estimatedTotalPaise: 21_000,
      items: [],
      updatedAt: new Date().toISOString(),
    },
  ],
  updatedAt: new Date().toISOString(),
};

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: activeUser.id, phone: activeUser.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(activeUser) },
    drafts: {
      getCurrent: jest.fn().mockResolvedValue(draft),
      saveCurrent: jest.fn().mockResolvedValue(draft),
      clearCurrent: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express().use(express.json()).use('/drafts', createDraftsRouter(services)).use(errorHandler);
}

const validBody = {
  serviceSlug: 'electrical',
  description: 'Fix the door',
  imagePaths: ['jobs/user-1/photo.jpg'],
  items: [
    { skillSlug: 'hinge-repair', quantity: 2 },
    { skillSlug: 'fan-installation' },
  ],
};

describe('drafts routes', () => {
  it('GET /drafts/current returns the caller’s active cart', async () => {
    const services = buildServices();

    const response = await request(appWith(services))
      .get('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toMatchObject({ estimatedTotalPaise: 21_000 });
    expect(response.body.groups[0]).toMatchObject({ id: 'draft-1' });
    expect(services.drafts.getCurrent).toHaveBeenCalledWith('user-1');
  });

  it('GET /drafts/current returns null when there is no cart', async () => {
    const services = buildServices();
    (services.drafts.getCurrent as jest.Mock).mockResolvedValue(null);

    const response = await request(appWith(services))
      .get('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toBeNull();
  });

  it('PUT /drafts/current saves the cart with defaults applied', async () => {
    const services = buildServices();

    await request(appWith(services))
      .put('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .send(validBody)
      .expect(200);

    expect(services.drafts.saveCurrent).toHaveBeenCalledWith('user-1', {
      description: 'Fix the door',
      imagePaths: ['jobs/user-1/photo.jpg'],
      groups: [
        {
          serviceSlug: 'electrical',
          items: [
            { skillSlug: 'hinge-repair', quantity: 2 },
            { skillSlug: 'fan-installation', quantity: 1 },
          ],
        },
      ],
    });
  });

  it('PUT /drafts/current accepts a grouped multi-service cart directly', async () => {
    const services = buildServices();

    await request(appWith(services))
      .put('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .send({
        description: 'Fix the door',
        imagePaths: ['jobs/user-1/photo.jpg'],
        groups: [
          {
            serviceSlug: 'electrical',
            items: [{ skillSlug: 'hinge-repair', quantity: 2 }],
          },
          {
            serviceSlug: 'plumbing',
            items: [{ skillSlug: 'leak-repair' }],
          },
        ],
      })
      .expect(200);

    expect(services.drafts.saveCurrent).toHaveBeenCalledWith('user-1', {
      description: 'Fix the door',
      imagePaths: ['jobs/user-1/photo.jpg'],
      groups: [
        {
          serviceSlug: 'electrical',
          items: [{ skillSlug: 'hinge-repair', quantity: 2 }],
        },
        {
          serviceSlug: 'plumbing',
          items: [{ skillSlug: 'leak-repair', quantity: 1 }],
        },
      ],
    });
  });

  it('PUT /drafts/current rejects two groups for the same service', async () => {
    const services = buildServices();

    const response = await request(appWith(services))
      .put('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .send({
        groups: [
          { serviceSlug: 'electrical', items: [{ skillSlug: 'hinge-repair' }] },
          { serviceSlug: 'electrical', items: [{ skillSlug: 'fan-installation' }] },
        ],
      })
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.drafts.saveCurrent).not.toHaveBeenCalled();
  });

  it('PUT /drafts/current accepts an empty cart as a clear', async () => {
    const services = buildServices();
    (services.drafts.saveCurrent as jest.Mock).mockResolvedValue(null);

    const response = await request(appWith(services))
      .put('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .send({ serviceSlug: 'electrical', items: [] })
      .expect(200);

    expect(response.body).toBeNull();
    expect(services.drafts.saveCurrent).toHaveBeenCalledWith('user-1', {
      description: '',
      imagePaths: [],
      groups: [],
    });
  });

  it('PUT /drafts/current rejects the same work twice', async () => {
    const services = buildServices();

    const response = await request(appWith(services))
      .put('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .send({
        ...validBody,
        items: [{ skillSlug: 'hinge-repair' }, { skillSlug: 'hinge-repair', quantity: 3 }],
      })
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.drafts.saveCurrent).not.toHaveBeenCalled();
  });

  it('PUT /drafts/current rejects more works than the limit', async () => {
    const services = buildServices();
    const items = Array.from({ length: JOB_ITEMS_LIMIT + 1 }, (_value, index) => ({
      skillSlug: `work-${index}`,
    }));

    const response = await request(appWith(services))
      .put('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .send({ serviceSlug: 'electrical', items })
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.drafts.saveCurrent).not.toHaveBeenCalled();
  });

  it('DELETE /drafts/current abandons the cart', async () => {
    const services = buildServices();

    const response = await request(appWith(services))
      .delete('/drafts/current')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(services.drafts.clearCurrent).toHaveBeenCalledWith('user-1');
  });
});

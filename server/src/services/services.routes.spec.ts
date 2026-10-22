import request from 'supertest';
import express from 'express';
import type { PopularSkill } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createServicesRouter } from './services.routes';

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

const popular: PopularSkill[] = [
  {
    id: 'sk1',
    serviceId: 's1',
    slug: 'leak-repair',
    name: 'Plumbing leak repair',
    icon: 'https://example.test/leak.png',
    service: { id: 's1', slug: 'plumbing', name: 'Plumbing', icon: null },
  },
];

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: activeUser.id, phone: activeUser.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(activeUser) },
    services: {
      listActive: jest.fn().mockResolvedValue([]),
      listSkillsForService: jest.fn().mockResolvedValue([]),
      listPopularSkills: jest.fn().mockResolvedValue(popular),
      searchServices: jest.fn().mockResolvedValue({ services: [], skills: [] }),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express()
    .use(express.json())
    .use('/services', createServicesRouter(services))
    .use(errorHandler);
}

describe('services routes', () => {
  it('serves the popular skills', async () => {
    const services = buildServices();

    const response = await request(appWith(services))
      .get('/services/popular-skills')
      .set('authorization', 'Bearer token')
      .expect(200);

    expect(response.body).toEqual(popular);
    expect(services.services.listPopularSkills).toHaveBeenCalledTimes(1);
  });

  it('does not treat "popular-skills" as a service slug', async () => {
    const services = buildServices();

    await request(appWith(services))
      .get('/services/popular-skills')
      .set('authorization', 'Bearer token')
      .expect(200);

    expect(services.services.listSkillsForService).not.toHaveBeenCalled();
  });

  it('requires a signed-in caller', async () => {
    const services = buildServices();

    await request(appWith(services)).get('/services/popular-skills').expect(401);
  });
});

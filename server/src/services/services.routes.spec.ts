import request from 'supertest';
import express from 'express';
import type { PopularSkill, ServiceWithWorkGroups } from '@samona/types';
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

const groupedWorks: ServiceWithWorkGroups = {
  service: { id: 'service-1', slug: 'electrician', name: 'Electrician', icon: null },
  groups: [
    {
      id: 'group-1',
      serviceId: 'service-1',
      name: 'Fans',
      slug: 'fans',
      imageUrl: 'asset://service-work-groups/fan',
      sortOrder: 1,
      isActive: true,
      works: [
        {
          id: 'skill-1',
          serviceId: 'service-1',
          slug: 'fan-repair',
          name: 'Fan repair',
          icon: null,
          groupId: 'group-1',
        },
      ],
    },
  ],
};

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
      listSkillGroupsForService: jest.fn().mockResolvedValue(groupedWorks),
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

  it('serves grouped works with the configured display data', async () => {
    const services = buildServices();

    const response = await request(appWith(services))
      .get('/services/electrician/groups')
      .set('authorization', 'Bearer token')
      .expect(200);

    expect(response.body).toEqual(groupedWorks);
    expect(services.services.listSkillGroupsForService).toHaveBeenCalledWith('electrician');
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

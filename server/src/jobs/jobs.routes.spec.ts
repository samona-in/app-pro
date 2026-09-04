import request from 'supertest';
import express from 'express';
import { ApiErrorCode, JobStatus } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createJobsRouter } from './jobs.routes';

const activeUser = {
  id: 'user-1',
  appType: 'customer' as const,
  isAdmin: false,
  phone: '+919876543210',
  email: null,
  fullName: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
};

const job = {
  id: 'job-1',
  customerId: 'cust-1',
  proId: null,
  service: { id: 'svc-1', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' },
  skill: { id: 'skill-1', slug: 'fan-installation', name: 'Fan installation' },
  customSkill: null,
  status: JobStatus.REQUESTED,
  placeType: 'RESIDENCE',
  placeDescription: null,
  description: 'Fix the switch near the door.',
  imageUrls: ['https://cdn/jobs/user-1/abc.jpg'],
  basePayPaise: 15_000,
  agreedPayPaise: null,
  finalPayPaise: null,
  createdAt: new Date().toISOString(),
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
    jobs: {
      createForCustomer: jest.fn().mockResolvedValue(job),
      listForCustomer: jest.fn().mockResolvedValue([job]),
      getForCustomer: jest.fn().mockResolvedValue(job),
    },
    ...overrides,
  } as unknown as Services;
}

function jobsService(partial: Partial<ReturnType<typeof buildServices>['jobs']> = {}) {
  return {
    createForCustomer: jest.fn().mockResolvedValue(job),
    listForCustomer: jest.fn().mockResolvedValue([job]),
    getForCustomer: jest.fn().mockResolvedValue(job),
    payForCustomer: jest.fn().mockResolvedValue(job),
    cancelJob: jest.fn().mockResolvedValue(job),
    listAvailableJobs: jest.fn().mockResolvedValue([job]),
    listProJobs: jest.fn().mockResolvedValue([job]),
    listJobHistory: jest.fn().mockResolvedValue([job]),
    getAvailableJobForPro: jest.fn().mockResolvedValue({ ...job, distanceKm: 1.2, estimatedEtaMinutes: 3 }),
    acceptJob: jest.fn().mockResolvedValue(job),
    transitionJob: jest.fn().mockResolvedValue(job),
    notifyReadyJobRequests: jest.fn().mockResolvedValue(undefined),
    expireStaleJobs: jest.fn().mockResolvedValue(0),
    startExpireSweep: jest.fn(),
    stopExpireSweep: jest.fn(),
    ...partial,
  };
}

function appWith(services: Services) {
  return express().use(express.json()).use('/jobs', createJobsRouter(services)).use(errorHandler);
}

const validBody = {
  serviceSlug: 'electrical',
  skillSlug: 'fan-installation',
  placeType: 'RESIDENCE',
  description: 'Fix the switch near the door.',
  imagePaths: ['jobs/user-1/abc.jpg'],
  basePayPaise: 15_000,
};

describe('jobs routes', () => {
  it('POST /jobs places a job request', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/jobs')
      .set('authorization', 'Bearer good.token')
      .send(validBody)
      .expect(201);

    expect(response.body).toMatchObject({ id: 'job-1', status: 'REQUESTED' });
    expect(services.jobs.createForCustomer).toHaveBeenCalledWith('user-1', validBody);
  });

  it('POST /jobs rejects an invalid body', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/jobs')
      .set('authorization', 'Bearer good.token')
      .send({ ...validBody, basePayPaise: 1 })
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.jobs.createForCustomer).not.toHaveBeenCalled();
  });

  it('POST /jobs requires a free-text category with the Other skill', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/jobs')
      .set('authorization', 'Bearer good.token')
      .send({ ...validBody, skillSlug: 'other' })
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.jobs.createForCustomer).not.toHaveBeenCalled();
  });

  it('GET /jobs lists the caller jobs', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .get('/jobs')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(services.jobs.listForCustomer).toHaveBeenCalledWith('user-1', 20);
  });

  it('GET /jobs/:id returns the caller job', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .get('/jobs/job-1')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body.id).toBe('job-1');
    expect(services.jobs.getForCustomer).toHaveBeenCalledWith('user-1', 'job-1');
  });

  it('rejects requests without auth', async () => {
    await request(appWith(buildServices())).get('/jobs').expect(401);
  });

  it('rejects PRO users from customer job routes', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
    });

    const response = await request(appWith(services))
      .get('/jobs')
      .set('authorization', 'Bearer good.token')
      .expect(403);

    expect(response.body.error.code).toBe(ApiErrorCode.FORBIDDEN);
  });

  it('PRO can list available jobs (not shadowed by customer /:id)', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
      jobs: jobsService(),
    });

    const response = await request(appWith(services))
      .get('/jobs/available')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(services.jobs.listAvailableJobs).toHaveBeenCalledWith('user-1', { limit: 20 });
  });

  it('PRO can list their own jobs via /jobs/mine', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
      jobs: jobsService(),
    });

    const response = await request(appWith(services))
      .get('/jobs/mine')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(services.jobs.listProJobs).toHaveBeenCalledWith('user-1', {
      status: undefined,
      limit: undefined,
    });
  });

  it('PRO can list their job-request history via /jobs/history', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
      jobs: jobsService(),
    });

    const response = await request(appWith(services))
      .get('/jobs/history')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(services.jobs.listJobHistory).toHaveBeenCalledWith('user-1', { limit: 20 });
  });

  it('PRO can read a single open request by id (incoming-job alert fetch)', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
      jobs: jobsService(),
    });

    const response = await request(appWith(services))
      .get('/jobs/job-1')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body.id).toBe('job-1');
    expect(services.jobs.getAvailableJobForPro).toHaveBeenCalledWith('user-1', 'job-1');
    expect(services.jobs.getForCustomer).not.toHaveBeenCalled();
  });

  it('CUSTOMER cannot read available or mine feeds', async () => {
    const services = buildServices({
      jobs: jobsService({ getForCustomer: jest.fn() }),
    });

    await request(appWith(services))
      .get('/jobs/available')
      .set('authorization', 'Bearer good.token')
      .expect(403);

    await request(appWith(services))
      .get('/jobs/mine')
      .set('authorization', 'Bearer good.token')
      .expect(403);

    expect(services.jobs.getForCustomer).not.toHaveBeenCalled();
  });
});

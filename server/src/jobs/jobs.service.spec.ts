import { JobStatus } from '@samona/types';
import { createJobsService } from './jobs.service';

const jobRow = {
  id: 'job-1',
  customerId: 'cust-1',
  proId: null,
  status: JobStatus.REQUESTED,
  placeType: 'RESIDENCE' as const,
  placeDescription: null,
  description: 'Fix the switch near the door.',
  imagePaths: ['jobs/user-1/abc.jpg'],
  basePayPaise: 15_000,
  agreedPayPaise: null,
  finalPayPaise: null,
  createdAt: new Date('2026-08-28T00:00:00Z'),
  updatedAt: new Date('2026-08-28T00:00:00Z'),
  service: { id: 'svc-1', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' },
  skill: {
    id: 'skill-1',
    slug: 'electrical-socket-switch-installation',
    name: 'Electrical socket and switch installation',
  },
};

function buildJobs() {
  const storage = {
    jobImageExists: jest.fn().mockResolvedValue(true),
    jobImagePublicUrl: jest.fn().mockImplementation((path: string) => `https://cdn/${path}`),
  };

  const txJobCreate = jest.fn().mockResolvedValue(jobRow);
  const txHistoryCreate = jest.fn().mockResolvedValue({});

  const prisma = {
    customerProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', userId: 'user-1' }),
    },
    service: { findFirst: jest.fn().mockResolvedValue({ id: 'svc-1' }) },
    skill: { findFirst: jest.fn().mockResolvedValue({ id: 'skill-1' }) },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        job: { create: txJobCreate },
        jobStatusHistory: { create: txHistoryCreate },
      };
      return fn(tx);
    }),
    job: { findMany: jest.fn(), findFirst: jest.fn() },
  };

  const jobs = createJobsService({ prisma: prisma as never, storage } as never);
  return { jobs, prisma, storage, txJobCreate, txHistoryCreate };
}

const baseInput = {
  serviceSlug: 'electrical',
  skillSlug: 'electrical-socket-switch-installation',
  placeType: 'RESIDENCE' as const,
  description: 'Fix the switch near the door.',
  imagePaths: ['jobs/user-1/abc.jpg'],
  basePayPaise: 15_000,
};

describe('createJobsService.createForCustomer', () => {
  it('creates the job and its initial status-history row', async () => {
    const { jobs, prisma } = buildJobs();

    const result = await jobs.createForCustomer('user-1', baseInput);

    expect(result).toMatchObject({
      id: 'job-1',
      status: 'REQUESTED',
      basePayPaise: 15_000,
      imageUrls: ['https://cdn/jobs/user-1/abc.jpg'],
      service: { slug: 'electrical' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown service', async () => {
    const ctx = buildJobs();
    ctx.prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      ctx.jobs.createForCustomer('user-1', { ...baseInput, serviceSlug: 'nope' }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });
  });

  it('rejects a skill that does not belong to the chosen service', async () => {
    const ctx = buildJobs();
    ctx.prisma.skill.findFirst.mockResolvedValue(null);

    await expect(
      ctx.jobs.createForCustomer('user-1', { ...baseInput, skillSlug: 'leak-repair' }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });
  });

  it('rejects a photo outside the caller scope', async () => {
    const ctx = buildJobs();

    await expect(
      ctx.jobs.createForCustomer('user-1', { ...baseInput, imagePaths: ['jobs/user-2/other.jpg'] }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });
    expect(ctx.storage.jobImageExists).not.toHaveBeenCalled();
  });

  it('rejects a photo that never reached storage', async () => {
    const ctx = buildJobs();
    ctx.storage.jobImageExists.mockResolvedValue(false);

    await expect(
      ctx.jobs.createForCustomer('user-1', {
        ...baseInput,
        imagePaths: ['jobs/user-1/missing.jpg'],
      }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });
  });

  it('records the place description only when OTHER was chosen', async () => {
    const ctx = buildJobs();
    await ctx.jobs.createForCustomer('user-1', {
      ...baseInput,
      placeType: 'OTHER',
      placeDescription: 'Community hall basement',
    });

    expect(ctx.txJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ placeDescription: 'Community hall basement' }),
      }),
    );
  });

  it('asks for the profile before creating anything', async () => {
    const ctx = buildJobs();
    ctx.prisma.customerProfile.findUnique.mockResolvedValue(null);

    await expect(ctx.jobs.createForCustomer('user-1', baseInput)).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('createJobsService.getForCustomer', () => {
  it('returns only jobs the caller placed', async () => {
    const ctx = buildJobs();
    ctx.prisma.job.findFirst.mockResolvedValue(jobRow);

    const job = await ctx.jobs.getForCustomer('user-1', 'job-1');
    expect(job.id).toBe('job-1');
    expect(ctx.prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1', customer: { userId: 'user-1' } } }),
    );
  });

  it('404s when the job does not belong to the caller', async () => {
    const ctx = buildJobs();
    ctx.prisma.job.findFirst.mockResolvedValue(null);

    await expect(ctx.jobs.getForCustomer('user-1', 'job-other')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
  });
});

describe('createJobsService.listForCustomer', () => {
  it('returns an empty list when the caller has no profile', async () => {
    const ctx = buildJobs();
    ctx.prisma.customerProfile.findUnique.mockResolvedValue(null);

    const result = await ctx.jobs.listForCustomer('user-unknown', 20);
    expect(result).toEqual([]);
    expect(ctx.prisma.job.findMany).not.toHaveBeenCalled();
  });
});

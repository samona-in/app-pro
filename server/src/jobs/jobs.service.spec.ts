import { JobStatus, NotificationKind } from '@samona/types';
import { createJobsService } from './jobs.service';
import { REALTIME_EVENTS } from '../realtime/gateway';

const jobRow = {
  id: 'job-1',
  customerId: 'cust-1',
  proId: null,
  status: JobStatus.REQUESTED,
  placeType: 'RESIDENCE' as const,
  placeDescription: null,
  locationLabel: null,
  latitude: null,
  longitude: null,
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
  customSkill: null,
};

function buildJobs() {
  const storage = {
    jobImageExists: jest.fn().mockResolvedValue(true),
    jobImagePublicUrl: jest.fn().mockImplementation((path: string) => `https://cdn/${path}`),
  };

  const matching = {
    findEligiblePros: jest.fn().mockResolvedValue([]),
  };

  const realtime = {
    emitToUsers: jest.fn(),
    emitToUser: jest.fn(),
  };

  const txJobCreate = jest.fn().mockResolvedValue(jobRow);
  const txHistoryCreate = jest.fn().mockResolvedValue({});

  const prisma = {
    customerProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', userId: 'user-1', locationLabel: null, latitude: null, longitude: null }),
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

  const jobs = createJobsService({
    prisma: prisma as never,
    storage,
    matching: matching as never,
    realtime: realtime as never,
  } as never);
  return { jobs, prisma, storage, matching, realtime, txJobCreate, txHistoryCreate };
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

  it('snapshots a submitted per-job location onto the job', async () => {
    const ctx = buildJobs();

    await ctx.jobs.createForCustomer('user-1', {
      ...baseInput,
      locationLabel: '10 MG Road, office',
      latitude: 12.97,
      longitude: 77.6,
    });

    expect(ctx.txJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationLabel: '10 MG Road, office',
          latitude: 12.97,
          longitude: 77.6,
        }),
      }),
    );
    // Matching is run against the job's own coordinates, not the profile.
    expect(ctx.matching.findEligiblePros).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 12.97, longitude: 77.6 }),
    );
  });

  it('falls back to the saved profile location when none is submitted', async () => {
    const ctx = buildJobs();
    ctx.prisma.customerProfile.findUnique.mockResolvedValue({
      id: 'cust-1',
      userId: 'user-1',
      locationLabel: 'Home, Koramangala',
      latitude: 12.93,
      longitude: 77.62,
    });

    await ctx.jobs.createForCustomer('user-1', baseInput);

    expect(ctx.txJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationLabel: 'Home, Koramangala',
          latitude: 12.93,
          longitude: 77.62,
        }),
      }),
    );
    expect(ctx.matching.findEligiblePros).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 12.93, longitude: 77.62 }),
    );
  });

  it('writes a null location when neither the booking nor the profile has one', async () => {
    const ctx = buildJobs();
    ctx.prisma.customerProfile.findUnique.mockResolvedValue({
      id: 'cust-1',
      userId: 'user-1',
      locationLabel: null,
      latitude: null,
      longitude: null,
    });

    await ctx.jobs.createForCustomer('user-1', baseInput);

    expect(ctx.txJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationLabel: null, latitude: null, longitude: null }),
      }),
    );
    // No location to match against, so no pros are nudged.
    expect(ctx.matching.findEligiblePros).not.toHaveBeenCalled();
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

  it('stores the free-text category when the Other skill is chosen', async () => {
    const ctx = buildJobs();
    await ctx.jobs.createForCustomer('user-1', {
      ...baseInput,
      skillSlug: 'other',
      customSkill: 'Inverter battery bank',
    });

    expect(ctx.txJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customSkill: 'Inverter battery bank' }),
      }),
    );
  });

  it('rejects the Other skill without a free-text category', async () => {
    const ctx = buildJobs();

    await expect(
      ctx.jobs.createForCustomer('user-1', { ...baseInput, skillSlug: 'other' }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a free-text category on a predefined skill', async () => {
    const ctx = buildJobs();

    await expect(
      ctx.jobs.createForCustomer('user-1', { ...baseInput, customSkill: 'Not allowed here' }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
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

describe('createJobsService.notifyReadyJobRequests', () => {
  const pro = {
    id: 'pro-1',
    userId: 'user-1',
    displayName: 'Ana',
    rating: 4.6,
    serviceRadiusKm: 5,
    latitude: 12.9716,
    longitude: 77.5946,
  };

  const openJob = (
    overrides: { id: string; latitude: number; longitude: number } & Partial<
      Omit<typeof jobRow, 'id' | 'latitude' | 'longitude'>
    >,
  ) => ({
    ...jobRow,
    ...overrides,
  });

  function buildCatchup() {
    const storage = { jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`) };

    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };
    const notifications = { alertEligiblePros: jest.fn().mockResolvedValue(undefined) };
    const isProEligible = jest.fn().mockResolvedValue(true);

    const proProfileFindUnique = jest.fn().mockResolvedValue(pro);
    const notificationFindMany = jest.fn().mockResolvedValue([]);
    const jobFindMany = jest.fn().mockResolvedValue([]);

    const prisma = {
      proProfile: { findUnique: proProfileFindUnique },
      notification: { findMany: notificationFindMany },
      job: { findMany: jobFindMany, findMany2: undefined },
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: { isProEligible } as never,
      realtime: realtime as never,
      notifications: notifications as never,
      config: { jobCatchupWindowMs: 2 * 60 * 60_000, jobCatchupLimit: 3 } as never,
    } as never);

    return { jobs, prisma, realtime, notifications, isProEligible, storage };
  }

  it('pages the pro for every still-open request inside their radius', async () => {
    const ctx = buildCatchup();
    const job = openJob({ id: 'job-1', latitude: 12.972, longitude: 77.595, description: 'Fix switch' });
    ctx.prisma.job.findMany.mockResolvedValue([job]);
    ctx.isProEligible.mockResolvedValue(true);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'job:new',
      expect.objectContaining({ id: 'job-1', distanceKm: expect.any(Number) }),
    );
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(ctx.notifications.alertEligiblePros).toHaveBeenCalledWith(
      [{ proId: 'pro-1' }],
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('does not page jobs the pro was already alerted for', async () => {
    const ctx = buildCatchup();
    const job = openJob({ id: 'job-1', latitude: 12.972, longitude: 77.595 });
    ctx.prisma.job.findMany.mockResolvedValue([job]);
    ctx.prisma.notification.findMany.mockResolvedValue([{ jobId: 'job-1' }]);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    expect(ctx.realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('skips requests the pro is no longer eligible for', async () => {
    const ctx = buildCatchup();
    const job = openJob({ id: 'job-1', latitude: 12.972, longitude: 77.595 });
    ctx.prisma.job.findMany.mockResolvedValue([job]);
    ctx.isProEligible.mockResolvedValue(false);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    expect(ctx.realtime.emitToUser).not.toHaveBeenCalled();
    expect(ctx.notifications.alertEligiblePros).not.toHaveBeenCalled();
  });

  it('dispatches at most the configured cap, nearest first', async () => {
    const ctx = buildCatchup();
    const jobs = [
      openJob({ id: 'far', latitude: 12.98, longitude: 77.61 }),
      openJob({ id: 'mid', latitude: 12.976, longitude: 77.60 }),
      openJob({ id: 'near', latitude: 12.972, longitude: 77.595 }),
      openJob({ id: 'nearest', latitude: 12.9725, longitude: 77.595 }),
    ];
    ctx.prisma.job.findMany.mockResolvedValue(jobs);
    ctx.isProEligible.mockResolvedValue(true);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    const ids = ctx.realtime.emitToUser.mock.calls.map((call: unknown[]) => (call[2] as { id: string }).id);
    expect(ids).toEqual(['near', 'nearest', 'mid']);
  });

  it('does nothing when the pro profile is missing', async () => {
    const ctx = buildCatchup();
    ctx.prisma.proProfile.findUnique.mockResolvedValue(null);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    expect(ctx.prisma.job.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when no open request is in the window', async () => {
    const ctx = buildCatchup();
    ctx.prisma.job.findMany.mockResolvedValue([]);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    expect(ctx.realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('narrows the window to jobs created after the anchor when createdAfter is given', async () => {
    const ctx = buildCatchup();
    const anchor = new Date('2026-08-28T12:00:00Z');
    const job = openJob({ id: 'job-1', latitude: 12.972, longitude: 77.595 });
    ctx.prisma.job.findMany.mockResolvedValue([job]);
    ctx.isProEligible.mockResolvedValue(true);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro, { createdAfter: anchor });

    const where = ctx.prisma.job.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gt: anchor });
  });

  it('filters with the recency window when createdAfter is omitted', async () => {
    const ctx = buildCatchup();
    ctx.prisma.job.findMany.mockResolvedValue([]);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    const where = ctx.prisma.job.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: expect.any(Date) });
  });
});

describe('createJobsService.expireStaleJobs', () => {
  function buildExpiry() {
    const storage = { jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`) };
    const realtime = { emitToUsers: jest.fn(), emitToUser: jest.fn() };
    const notifications = {
      alertEligiblePros: jest.fn().mockResolvedValue(undefined),
      resolveJobAlerts: jest.fn().mockResolvedValue(undefined),
    };

    const jobFindMany = jest.fn().mockResolvedValue([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const historyCreate = jest.fn().mockResolvedValue({});
    const findFirstOrThrow = jest
      .fn()
      .mockResolvedValue({ ...jobRow, id: 'job-old', status: JobStatus.EXPIRED, expiresAt: new Date() });
    const notificationFindMany = jest.fn().mockResolvedValue([]);

    const prisma = {
      job: {
        findMany: jobFindMany,
        findFirstOrThrow,
        updateMany,
      },
      jobStatusHistory: { create: historyCreate },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          job: { updateMany, findFirstOrThrow },
          jobStatusHistory: { create: historyCreate },
        };
        return fn(tx);
      }),
      notification: { findMany: notificationFindMany },
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: {} as never,
      realtime: realtime as never,
      notifications: notifications as never,
      config: { jobExpireTtlMs: 30 * 60_000, jobExpireSweepMs: 60_000 } as never,
    } as never);

    return { jobs, prisma, realtime, notifications, storage };
  }

  it('scans only REQUESTED jobs older than the TTL', async () => {
    const ctx = buildExpiry();
    ctx.prisma.job.findMany.mockResolvedValue([
      { id: 'job-old', customer: { userId: 'user-1' } },
    ]);

    await ctx.jobs.expireStaleJobs();

    const where = ctx.prisma.job.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: JobStatus.REQUESTED, createdAt: { lt: expect.any(Date) } });
  });

  it('expires a stale job: status, history, alerts and realtime for the customer', async () => {
    const ctx = buildExpiry();
    ctx.prisma.job.findMany.mockResolvedValue([
      { id: 'job-old', customer: { userId: 'user-1' } },
    ]);

    await ctx.jobs.expireStaleJobs();

    expect(ctx.prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-old', status: JobStatus.REQUESTED, proId: null },
        data: expect.objectContaining({ status: JobStatus.EXPIRED, expiresAt: expect.any(Date) }),
      }),
    );
    expect(ctx.prisma.jobStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { jobId: 'job-old', fromStatus: JobStatus.REQUESTED, toStatus: JobStatus.EXPIRED },
      }),
    );
    expect(ctx.notifications.resolveJobAlerts).toHaveBeenCalledWith('job-old');
    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'job:status',
      expect.objectContaining({ id: 'job-old', status: JobStatus.EXPIRED }),
    );
  });

  it('also closes the overlays of every alerted pro', async () => {
    const ctx = buildExpiry();
    ctx.prisma.job.findMany.mockResolvedValue([
      { id: 'job-old', customer: { userId: 'user-1' } },
    ]);
    ctx.prisma.notification.findMany.mockResolvedValue([
      { pro: { userId: 'pro-user-1' } },
      { pro: { userId: 'pro-user-2' } },
    ]);

    await ctx.jobs.expireStaleJobs();

    expect(ctx.realtime.emitToUsers).toHaveBeenCalledWith(
      ['pro-user-1', 'pro-user-2'],
      'job:status',
      expect.objectContaining({ id: 'job-old', status: JobStatus.EXPIRED }),
    );
  });

  it('never expires a job that was just accepted by a racing pro', async () => {
    const ctx = buildExpiry();
    ctx.prisma.job.findMany.mockResolvedValue([
      { id: 'job-old', customer: { userId: 'user-1' } },
    ]);
    ctx.prisma.job.updateMany.mockResolvedValue({ count: 0 });

    await ctx.jobs.expireStaleJobs();

    expect(ctx.realtime.emitToUser).not.toHaveBeenCalled();
    expect(ctx.notifications.resolveJobAlerts).not.toHaveBeenCalled();
  });
});

describe('createJobsService.getAvailableJobForPro', () => {
  const pro = { id: 'pro-1', latitude: 12.9716, longitude: 77.5946 };

  function buildSingle() {
    const storage = { jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`) };

    const proProfileFindUnique = jest.fn().mockResolvedValue(pro);
    const proServiceFindMany = jest.fn().mockResolvedValue([{ serviceId: 'svc-1' }]);
    const jobFindFirst = jest
      .fn()
      .mockResolvedValue({ ...jobRow, latitude: 12.972, longitude: 77.595 });

    const prisma = {
      proProfile: { findUnique: proProfileFindUnique },
      proService: { findMany: proServiceFindMany },
      job: { findFirst: jobFindFirst },
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      config: {} as never,
    } as never);

    return { jobs, prisma, storage };
  }

  it('returns the open request with distance for the pro', async () => {
    const ctx = buildSingle();

    const result = await ctx.jobs.getAvailableJobForPro('user-1', 'job-1');

    expect(result.id).toBe('job-1');
    expect(result.distanceKm).toEqual(expect.any(Number));
    expect(ctx.prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'job-1',
          status: JobStatus.REQUESTED,
          proId: null,
          serviceId: { in: ['svc-1'] },
        },
      }),
    );
  });

  it('404s when the request is no longer open', async () => {
    const ctx = buildSingle();
    ctx.prisma.job.findFirst.mockResolvedValue(null);

    await expect(ctx.jobs.getAvailableJobForPro('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
  });

  it('scopes the read to the pro’s services', async () => {
    const ctx = buildSingle();
    ctx.prisma.proService.findMany.mockResolvedValue([]);

    await expect(ctx.jobs.getAvailableJobForPro('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(ctx.prisma.job.findFirst).not.toHaveBeenCalled();
  });
});

describe('createJobsService.acceptJob', () => {
  const pro = { id: 'pro-1', latitude: 12.9716, longitude: 77.5946 };

  function buildAccept() {
    const updatedRow = {
      ...jobRow,
      status: JobStatus.ACCEPTED,
      proId: 'pro-1',
      customer: { userId: 'cust-user-1', displayName: 'Cust' },
      pro: { userId: 'pro-user-1' },
    };

    const openRow = {
      ...jobRow,
      latitude: 12.972,
      longitude: 77.594,
      customer: { userId: 'cust-user-1', displayName: 'Cust' },
      pro: null,
    };

    const notificationFindMany = jest.fn().mockResolvedValue([
      { pro: { userId: 'other-1' } },
      { pro: { userId: 'other-2' } },
    ]);
    const resolveJobAlerts = jest.fn().mockResolvedValue(undefined);

    const realtime = {
      emitToUser: jest.fn(),
      emitToUsers: jest.fn(),
    };

    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((path: string) => `https://cdn/${path}`),
    };

    const prisma = {
      proProfile: { findUnique: jest.fn().mockResolvedValue(pro) },
      notification: { findMany: notificationFindMany },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          job: {
            findFirst: jest.fn().mockResolvedValue(openRow),
            count: jest.fn().mockResolvedValue(0),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirstOrThrow: jest.fn().mockResolvedValue(updatedRow),
          },
          proProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'pro-1' }) },
          jobStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: { isProEligible: jest.fn().mockResolvedValue(true) } as never,
      realtime: realtime as never,
      notifications: { resolveJobAlerts } as never,
    } as never);

    return { jobs, prisma, realtime, storage, resolveJobAlerts, updatedRow };
  }

  it('publishes the accepted status to every other alerted pro, excluding the accepting pro', async () => {
    const ctx = buildAccept();

    const returned = await ctx.jobs.acceptJob('user-1', 'job-1');

    expect(returned.status).toBe(JobStatus.ACCEPTED);
    expect(ctx.prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jobId: 'job-1',
          kind: NotificationKind.JOB_ALERT,
          resolvedAt: null,
          proId: { not: 'pro-1' },
        },
      }),
    );
    expect(ctx.realtime.emitToUsers).toHaveBeenCalledWith(
      ['other-1', 'other-2'],
      REALTIME_EVENTS.JOB_STATUS,
      expect.objectContaining({ status: JobStatus.ACCEPTED }),
    );
    // The accepting pro gets the single-recipient status event, not the batch.
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(2);
  });

  it('stops the repeating alerts for the now-claimed job', async () => {
    const ctx = buildAccept();

    await ctx.jobs.acceptJob('user-1', 'job-1');

    expect(ctx.resolveJobAlerts).toHaveBeenCalledWith('job-1');
  });
});

import { JobStatus, NotificationKind } from '@samona/types';
import { createJobsService } from './jobs.service';
import { mintJobOffer } from './job-offers';
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
    selfiePublicUrl: jest.fn().mockImplementation((path: string) => `https://cdn/${path}`),
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
      findUnique: jest.fn().mockResolvedValue({
        id: 'cust-1',
        userId: 'user-1',
        locationLabel: null,
        latitude: null,
        longitude: null,
      }),
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
    config: { jobExpireTtlMs: 30 * 60_000 } as never,
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

  it('shares the assigned pro with a photo URL drawn from their selfie', async () => {
    const ctx = buildJobs();
    ctx.prisma.job.findFirst.mockResolvedValue({
      ...jobRow,
      status: JobStatus.TRAVELLING,
      proId: 'pro-1',
      verificationOtp: null,
      customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
      pro: {
        id: 'pro-1',
        userId: 'user-1',
        displayName: 'Ravi',
        rating: 4.8,
        selfiePhotoPath: 'pros/user-1/selfie.jpg',
        profile: { phone: '+910000000000' },
      },
    });

    const job = await ctx.jobs.getForCustomer('user-1', 'job-1');

    expect(job.pro).toMatchObject({
      proId: 'pro-1',
      displayName: 'Ravi',
      rating: 4.8,
      phone: '+910000000000',
      photoUrl: 'https://cdn/pros/user-1/selfie.jpg',
    });
  });

  it('leaves the pro photo null when the assigned pro has no selfie', async () => {
    const ctx = buildJobs();
    ctx.prisma.job.findFirst.mockResolvedValue({
      ...jobRow,
      status: JobStatus.ACCEPTED,
      proId: 'pro-1',
      verificationOtp: null,
      customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
      pro: {
        id: 'pro-1',
        userId: 'user-1',
        displayName: 'Ravi',
        rating: null,
        selfiePhotoPath: null,
        profile: { phone: null },
      },
    });

    const job = await ctx.jobs.getForCustomer('user-1', 'job-1');

    expect(job.pro).toMatchObject({ photoUrl: null });
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
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };

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
      config: {
        jobCatchupWindowMs: 2 * 60 * 60_000,
        jobCatchupLimit: 3,
        jobExpireTtlMs: 10_000,
      } as never,
    } as never);

    return { jobs, prisma, realtime, notifications, isProEligible, storage };
  }

  it('pages the pro for every still-open request inside their radius', async () => {
    const ctx = buildCatchup();
    const job = openJob({
      id: 'job-1',
      latitude: 12.972,
      longitude: 77.595,
      description: 'Fix switch',
    });
    ctx.prisma.job.findMany.mockResolvedValue([job]);
    ctx.isProEligible.mockResolvedValue(true);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'job:new',
      expect.objectContaining({
        id: 'job-1',
        distanceKm: expect.any(Number),
        expiresAt: '2026-08-28T00:00:10.000Z',
      }),
    );
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(ctx.notifications.alertEligiblePros).toHaveBeenCalledWith(
      [{ proId: 'pro-1', distanceKm: expect.any(Number) }],
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
      openJob({ id: 'mid', latitude: 12.976, longitude: 77.6 }),
      openJob({ id: 'near', latitude: 12.972, longitude: 77.595 }),
      openJob({ id: 'nearest', latitude: 12.9725, longitude: 77.595 }),
    ];
    ctx.prisma.job.findMany.mockResolvedValue(jobs);
    ctx.isProEligible.mockResolvedValue(true);

    await ctx.jobs.notifyReadyJobRequests('user-1', pro);

    const ids = ctx.realtime.emitToUser.mock.calls.map(
      (call: unknown[]) => (call[2] as { id: string }).id,
    );
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
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };
    const realtime = { emitToUsers: jest.fn(), emitToUser: jest.fn() };
    const notifications = {
      alertEligiblePros: jest.fn().mockResolvedValue(undefined),
      resolveJobAlerts: jest.fn().mockResolvedValue(undefined),
      recordCustomerNotification: jest.fn().mockResolvedValue(undefined),
      sendCustomerPush: jest.fn().mockResolvedValue(undefined),
    };

    const jobFindMany = jest.fn().mockResolvedValue([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const historyCreate = jest.fn().mockResolvedValue({});
    const findFirstOrThrow = jest.fn().mockResolvedValue({
      ...jobRow,
      id: 'job-old',
      status: JobStatus.EXPIRED,
      expiresAt: new Date(),
    });
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
      {
        id: 'job-old',
        customerId: 'cust-1',
        customer: { userId: 'user-1' },
        service: { name: 'Electrical' },
      },
    ]);

    await ctx.jobs.expireStaleJobs();

    const where = ctx.prisma.job.findMany.mock.calls[0][0].where;
    // Fresh jobs (expiresAt null) are swept by their createdAt age; re-released
    // jobs carry an explicit expiresAt and are swept against that instead.
    expect(where).toMatchObject({
      status: JobStatus.REQUESTED,
      OR: [
        { expiresAt: { not: null, lt: expect.any(Date) } },
        { expiresAt: null, createdAt: { lt: expect.any(Date) } },
      ],
    });
  });

  it('expires a stale job: status, history, alerts and realtime for the customer', async () => {
    const ctx = buildExpiry();
    ctx.prisma.job.findMany.mockResolvedValue([
      {
        id: 'job-old',
        customerId: 'cust-1',
        customer: { userId: 'user-1' },
        service: { name: 'Electrical' },
      },
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
    expect(ctx.notifications.resolveJobAlerts).toHaveBeenCalledWith('job-old', 'EXPIRED');
    expect(ctx.notifications.recordCustomerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        customerUserId: 'user-1',
        jobId: 'job-old',
        kind: NotificationKind.JOB_STATUS,
        title: 'Request expired',
        route: '/booking/job-old',
      }),
    );
    expect(ctx.notifications.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'user-1',
      jobId: 'job-old',
      title: 'Request expired',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'job:status',
      expect.objectContaining({ id: 'job-old', status: JobStatus.EXPIRED }),
    );
  });

  it('also closes the overlays of every alerted pro', async () => {
    const ctx = buildExpiry();
    ctx.prisma.job.findMany.mockResolvedValue([
      {
        id: 'job-old',
        customerId: 'cust-1',
        customer: { userId: 'user-1' },
        service: { name: 'Electrical' },
      },
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
      {
        id: 'job-old',
        customerId: 'cust-1',
        customer: { userId: 'user-1' },
        service: { name: 'Electrical' },
      },
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
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };

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
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
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
          declines: { none: { proId: 'pro-1' } },
        },
      }),
    );
  });

  it('404s a request the pro already declined', async () => {
    const ctx = buildSingle();
    ctx.prisma.job.findFirst.mockImplementationOnce(
      async (_where: { where: Record<string, unknown> }) => {
        if ((_where.where.declines as { none: { proId: string } }).none.proId === 'pro-1') {
          return null;
        }
        return { ...jobRow, latitude: 12.972, longitude: 77.595 };
      },
    );

    await expect(ctx.jobs.getAvailableJobForPro('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
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
      customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
      pro: { userId: 'pro-user-1', profile: { phone: null } },
    };

    const openRow = {
      ...jobRow,
      latitude: 12.972,
      longitude: 77.594,
      customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
      pro: null,
    };

    const notificationFindMany = jest
      .fn()
      .mockResolvedValue([{ pro: { userId: 'other-1' } }, { pro: { userId: 'other-2' } }]);
    const resolveJobAlerts = jest.fn().mockResolvedValue(undefined);
    const recordCustomerNotification = jest.fn().mockResolvedValue(undefined);
    const sendCustomerPush = jest.fn().mockResolvedValue(undefined);
    const jobDeclineCount = jest.fn().mockResolvedValue(0);

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
          jobDecline: { count: jobDeclineCount },
        }),
      ),
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: { isProEligible: jest.fn().mockResolvedValue(true) } as never,
      realtime: realtime as never,
      notifications: { resolveJobAlerts, recordCustomerNotification, sendCustomerPush } as never,
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return {
      jobs,
      prisma,
      realtime,
      storage,
      resolveJobAlerts,
      recordCustomerNotification,
      sendCustomerPush,
      updatedRow,
      jobDeclineCount,
    };
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

    expect(ctx.resolveJobAlerts).toHaveBeenCalledWith('job-1', 'ACCEPTED');
  });

  it('records an accepted notice and pushes it to the customer', async () => {
    const ctx = buildAccept();

    await ctx.jobs.acceptJob('user-1', 'job-1');

    expect(ctx.recordCustomerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        customerUserId: 'cust-user-1',
        jobId: 'job-1',
        kind: NotificationKind.JOB_STATUS,
        title: 'Booking accepted',
        route: '/booking/job-1',
      }),
    );
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'cust-user-1',
      jobId: 'job-1',
      title: 'Booking accepted',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
  });

  it('still accepts even when the notice write fails — notices never block the transition', async () => {
    const ctx = buildAccept();
    ctx.recordCustomerNotification.mockRejectedValueOnce(
      new Error('PrismaClientKnownRequestError: table does not exist'),
    );

    await expect(ctx.jobs.acceptJob('user-1', 'job-1')).resolves.toMatchObject({
      status: JobStatus.ACCEPTED,
    });
  });

  it('still accepts even when the status push fails — pushes never block the transition', async () => {
    const ctx = buildAccept();
    ctx.sendCustomerPush.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(ctx.jobs.acceptJob('user-1', 'job-1')).resolves.toMatchObject({
      status: JobStatus.ACCEPTED,
    });
  });

  it('refuses to claim a job the pro has declined or released back to the pool', async () => {
    const ctx = buildAccept();
    ctx.jobDeclineCount.mockResolvedValue(1);

    await expect(ctx.jobs.acceptJob('user-1', 'job-1')).rejects.toThrow(
      'You have already declined this job.',
    );
  });
});

describe('createJobsService.acceptJobWithOffer', () => {
  const OFFER_SECRET = 'shared-offer-secret-that-is-long-enough';

  function buildOfferAccept() {
    const updatedRow = {
      ...jobRow,
      status: JobStatus.ACCEPTED,
      proId: 'pro-1',
      customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
      pro: { userId: 'pro-user-1', profile: { phone: null } },
    };

    const openRow = {
      ...jobRow,
      latitude: 12.972,
      longitude: 77.594,
      customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
      pro: null,
    };

    const notificationFindMany = jest
      .fn()
      .mockResolvedValue([{ pro: { userId: 'other-1' } }, { pro: { userId: 'other-2' } }]);
    const resolveJobAlerts = jest.fn().mockResolvedValue(undefined);
    const recordCustomerNotification = jest.fn().mockResolvedValue(undefined);
    const sendCustomerPush = jest.fn().mockResolvedValue(undefined);
    const offerUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const jobDeclineCount = jest.fn().mockResolvedValue(0);

    const realtime = {
      emitToUser: jest.fn(),
      emitToUsers: jest.fn(),
    };

    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };

    const prisma = {
      proProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pro-1', userId: 'user-1' }),
      },
      jobOffer: { updateMany: offerUpdateMany },
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
          jobDecline: { count: jobDeclineCount },
        }),
      ),
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: { isProEligible: jest.fn().mockResolvedValue(true) } as never,
      realtime: realtime as never,
      notifications: { resolveJobAlerts, recordCustomerNotification, sendCustomerPush } as never,
      config: { jobOfferSecret: OFFER_SECRET, jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return {
      jobs,
      prisma,
      realtime,
      resolveJobAlerts,
      recordCustomerNotification,
      sendCustomerPush,
      offerUpdateMany,
      updatedRow,
    };
  }

  it('consumes the offer, claims the job and settles the outcome as ACCEPTED', async () => {
    const ctx = buildOfferAccept();
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    const returned = await ctx.jobs.acceptJobWithOffer(token, 'device-1', 'job-1');

    expect(returned.status).toBe(JobStatus.ACCEPTED);
    // Ledger: consumed first, then settled ACCEPTED.
    const [consume, settle] = ctx.offerUpdateMany.mock.calls;
    expect(consume[0].where).toEqual({ tokenHash: expect.any(String), consumedAt: null });
    expect(consume[0].data.consumedAt).toBeInstanceOf(Date);
    expect(settle[0].data.outcome).toBe('ACCEPTED');
    expect(ctx.resolveJobAlerts).toHaveBeenCalledWith('job-1', 'ACCEPTED');
  });

  it('rejects an offer minted for a different device', async () => {
    const ctx = buildOfferAccept();
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-a',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await expect(ctx.jobs.acceptJobWithOffer(token, 'device-b', 'job-1')).rejects.toThrow(
      'This offer belongs to another device.',
    );
    expect(ctx.offerUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects a token for a different job than the route it was sent to', async () => {
    const ctx = buildOfferAccept();
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-other',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await expect(ctx.jobs.acceptJobWithOffer(token, 'device-1', 'job-1')).rejects.toThrow(
      'This offer is no longer valid.',
    );
  });

  it('refuses to replay a consumed offer token', async () => {
    const ctx = buildOfferAccept();
    ctx.offerUpdateMany.mockResolvedValueOnce({ count: 0 });
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await expect(ctx.jobs.acceptJobWithOffer(token, 'device-1', 'job-1')).rejects.toThrow(
      'This offer was already used.',
    );
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when no JOB_OFFER_SECRET is configured', async () => {
    const ctx = buildOfferAccept();
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    const jobsNoSecret = createJobsService({
      prisma: ctx.prisma as never,
      storage: { jobImagePublicUrl: jest.fn() } as never,
      matching: { isProEligible: jest.fn().mockResolvedValue(true) } as never,
      realtime: { emitToUser: jest.fn(), emitToUsers: jest.fn() } as never,
      notifications: { resolveJobAlerts: jest.fn() } as never,
      config: { jobOfferSecret: null } as never,
    } as never);

    await expect(jobsNoSecret.acceptJobWithOffer(token, 'device-1', 'job-1')).rejects.toThrow(
      'This offer is no longer valid.',
    );
  });

  it('marks the offer EXPIRED when the claim loses the race', async () => {
    const ctx = buildOfferAccept();
    ctx.prisma.$transaction.mockImplementation(async (_fn: unknown) => {
      throw new Error('This job was already assigned.');
    });
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await expect(ctx.jobs.acceptJobWithOffer(token, 'device-1', 'job-1')).rejects.toThrow(
      'This job was already assigned.',
    );
    const [, settle] = ctx.offerUpdateMany.mock.calls;
    expect(settle[0].data.outcome).toBe('EXPIRED');
  });
});

describe('createJobsService.rejectJobOffer', () => {
  const OFFER_SECRET = 'shared-offer-secret-that-is-long-enough';

  function buildOfferReject() {
    const offerUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const declineUpsert = jest.fn().mockResolvedValue({ id: 'decline-1' });
    const alertUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const proProfileFindUnique = jest.fn().mockResolvedValue({ userId: 'user-1' });
    const prisma = {
      jobOffer: { updateMany: offerUpdateMany },
      proProfile: { findUnique: proProfileFindUnique },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          jobDecline: { upsert: declineUpsert },
          notification: { updateMany: alertUpdateMany },
        }),
      ),
    };
    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: { jobImagePublicUrl: jest.fn() } as never,
      matching: { isProEligible: jest.fn() } as never,
      realtime: realtime as never,
      notifications: { resolveJobAlerts: jest.fn() } as never,
      config: { jobOfferSecret: OFFER_SECRET, jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return { jobs, prisma, realtime, offerUpdateMany, declineUpsert, alertUpdateMany };
  }

  it('consumes the offer, records a JobDecline and stops paging this pro', async () => {
    const ctx = buildOfferReject();
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await ctx.jobs.rejectJobOffer(token, 'device-1', 'job-1');

    expect(ctx.offerUpdateMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String), consumedAt: null },
      data: { consumedAt: expect.any(Date), outcome: 'REJECTED' },
    });
    expect(ctx.declineUpsert).toHaveBeenCalledWith({
      where: { jobId_proId: { jobId: 'job-1', proId: 'pro-1' } },
      create: { jobId: 'job-1', proId: 'pro-1' },
      update: {},
    });
    expect(ctx.alertUpdateMany).toHaveBeenCalledWith({
      where: {
        jobId: 'job-1',
        proId: 'pro-1',
        kind: NotificationKind.JOB_ALERT,
        resolvedAt: null,
      },
      data: { resolvedAt: expect.any(Date) },
    });
    expect(ctx.prisma.proProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'pro-1' },
      select: { userId: true },
    });
    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith('user-1', 'job:offer:ended', {
      jobId: 'job-1',
    });
  });

  it('is idempotent for a replayed token: resolves the decline but settles only the first act', async () => {
    const ctx = buildOfferReject();
    ctx.offerUpdateMany.mockResolvedValueOnce({ count: 0 });
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await expect(ctx.jobs.rejectJobOffer(token, 'device-1', 'job-1')).resolves.toBeUndefined();
    expect(ctx.declineUpsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a token bound to a different device', async () => {
    const ctx = buildOfferReject();
    const token = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-a',
      secret: OFFER_SECRET,
      ttlMs: 90_000,
    }).token;

    await expect(ctx.jobs.rejectJobOffer(token, 'device-b', 'job-1')).rejects.toThrow(
      'This offer belongs to another device.',
    );
    expect(ctx.offerUpdateMany).not.toHaveBeenCalled();
    expect(ctx.realtime.emitToUser).not.toHaveBeenCalled();
  });
});

describe('createJobsService.declineJob', () => {
  const pro = { id: 'pro-1', userId: 'user-1', latitude: 12.9716, longitude: 77.5946 };

  function buildDecline() {
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };
    const proProfileFindUnique = jest.fn().mockResolvedValue(pro);
    const proServiceFindMany = jest.fn().mockResolvedValue([{ serviceId: 'svc-1' }]);
    const jobFindFirst = jest.fn().mockResolvedValue({ id: 'job-1' });
    const declineUpsert = jest.fn().mockResolvedValue({ id: 'decline-1' });
    const alertUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };

    const prisma = {
      proProfile: { findUnique: proProfileFindUnique },
      proService: { findMany: proServiceFindMany },
      job: { findFirst: jobFindFirst },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          jobDecline: { upsert: declineUpsert },
          notification: { updateMany: alertUpdateMany },
        }),
      ),
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      realtime: realtime as never,
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return { jobs, prisma, realtime, declineUpsert, alertUpdateMany, storage };
  }

  it('records the decline, resolves the pro’s own job-alert rows and resolves the offer', async () => {
    const ctx = buildDecline();

    await ctx.jobs.declineJob('user-1', 'job-1');

    expect(ctx.declineUpsert).toHaveBeenCalledWith({
      where: { jobId_proId: { jobId: 'job-1', proId: 'pro-1' } },
      create: { jobId: 'job-1', proId: 'pro-1' },
      update: {},
    });
    expect(ctx.alertUpdateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1', proId: 'pro-1', kind: NotificationKind.JOB_ALERT, resolvedAt: null },
      data: { resolvedAt: expect.any(Date) },
    });
    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith('user-1', 'job:offer:ended', {
      jobId: 'job-1',
    });
  });

  it('is idempotent for a repeated decline of the same job', async () => {
    const ctx = buildDecline();
    ctx.declineUpsert.mockResolvedValue({ id: 'decline-1' });

    await ctx.jobs.declineJob('user-1', 'job-1');
    await ctx.jobs.declineJob('user-1', 'job-1');

    expect(ctx.declineUpsert).toHaveBeenCalledTimes(2);
    expect(ctx.declineUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { jobId_proId: { jobId: 'job-1', proId: 'pro-1' } } }),
    );
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(2);
  });

  it('404s when the request is no longer open', async () => {
    const ctx = buildDecline();
    ctx.prisma.job.findFirst.mockResolvedValue(null);

    await expect(ctx.jobs.declineJob('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(ctx.declineUpsert).not.toHaveBeenCalled();
  });

  it('404s when the pro serves none of the job’s services', async () => {
    const ctx = buildDecline();
    ctx.prisma.proService.findMany.mockResolvedValue([]);

    await expect(ctx.jobs.declineJob('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(ctx.prisma.job.findFirst).not.toHaveBeenCalled();
  });
});

describe('createJobsService.listAvailableJobs', () => {
  const pro = { id: 'pro-1', latitude: 12.9716, longitude: 77.5946 };

  function buildFeed() {
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };
    const proProfileFindUnique = jest.fn().mockResolvedValue(pro);
    const proServiceFindMany = jest.fn().mockResolvedValue([{ serviceId: 'svc-1' }]);
    // Two candidate jobs: one inside the pro's radius, one far away. The
    // matching predicate is the pool's authority on inclusion.
    const nearJob = { ...jobRow, id: 'near', serviceId: 'svc-1', latitude: 12.972, longitude: 77.595 };
    const farJob = { ...jobRow, id: 'far', serviceId: 'svc-1', latitude: 13.1, longitude: 77.7 };
    const isProEligible = jest
      .fn()
      .mockImplementation((_proId: string, job: { latitude: number }) => job.latitude < 12.99);

    const prisma = {
      proProfile: { findUnique: proProfileFindUnique },
      proService: { findMany: proServiceFindMany },
      job: { findMany: jest.fn().mockResolvedValue([farJob, nearJob]) },
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: { isProEligible } as never,
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return { jobs, prisma, isProEligible };
  }

  it('scopes the candidate set to the pro’s services and open assignments', async () => {
    const ctx = buildFeed();

    await ctx.jobs.listAvailableJobs('user-1');

    expect(ctx.prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: JobStatus.REQUESTED,
          proId: null,
          serviceId: { in: ['svc-1'] },
          declines: { none: { proId: 'pro-1' } },
        },
      }),
    );
  });

  it('surfaces only approved jobs, nearest first, with distance and ETA', async () => {
    const ctx = buildFeed();

    const pool = await ctx.jobs.listAvailableJobs('user-1');

    // `isProEligible` — the same predicate the offer path uses — rejects the
    // far job, and the pool reports distance/ETA from the pro's location.
    expect(ctx.isProEligible).toHaveBeenCalledWith('pro-1', {
      serviceId: 'svc-1',
      latitude: 13.1,
      longitude: 77.7,
    });
    expect(ctx.isProEligible).toHaveBeenCalledWith('pro-1', {
      serviceId: 'svc-1',
      latitude: 12.972,
      longitude: 77.595,
    });
    expect(pool.map((job) => job.id)).toEqual(['near']);
    const near = pool[0];
    expect(near).toBeDefined();
    if (!near) throw new Error('Expected the near job in the returned pool.');
    expect(near.distanceKm).toBeCloseTo(0.05, 1);
    expect(near.estimatedEtaMinutes).toBeGreaterThan(0);
    expect(near).toMatchObject({ service: { name: 'Electrical' } });
  });

  it('returns an empty pool when the pro is not eligible for any candidate', async () => {
    const ctx = buildFeed();
    ctx.isProEligible.mockImplementation(() => false);

    const pool = await ctx.jobs.listAvailableJobs('user-1');

    expect(pool).toEqual([]);
    expect(ctx.isProEligible).toHaveBeenCalledTimes(2);
  });

  it('returns an empty pool for a pro with no services', async () => {
    const ctx = buildFeed();
    ctx.prisma.proService.findMany.mockResolvedValue([]);

    const pool = await ctx.jobs.listAvailableJobs('user-1');

    expect(pool).toEqual([]);
    expect(ctx.prisma.job.findMany).not.toHaveBeenCalled();
  });
});

describe('createJobsService.transitionJob', () => {
  /** A job in TRAVELLING, ready to confirm arrival. Work spot is Bangalore, MG Road. */
  const travellingRow = {
    ...jobRow,
    proId: 'pro-1',
    status: JobStatus.TRAVELLING,
    latitude: 12.9756,
    longitude: 77.6099,
    verificationOtp: null,
    customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
    pro: { userId: 'user-1', displayName: 'Pro', profile: { phone: null } },
  };

  function buildTransition() {
    const jobFindFirst = jest.fn().mockResolvedValue(travellingRow);
    const historyCreate = jest.fn().mockResolvedValue({});
    const jobUpdate = jest
      .fn()
      .mockImplementation(
        async (args: {
          data: { status: JobStatus; completedAt?: Date; finalPayPaise?: number };
        }) => ({
          ...travellingRow,
          status: args.data.status ?? travellingRow.status,
          ...(args.data.completedAt ? { completedAt: args.data.completedAt } : {}),
          ...(args.data.finalPayPaise !== undefined
            ? { finalPayPaise: args.data.finalPayPaise }
            : {}),
        }),
      );
    const recordCustomerNotification = jest.fn().mockResolvedValue(undefined);
    const sendCustomerPush = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      proProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'pro-1', userId: 'user-1' }) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          job: { findFirst: jobFindFirst, update: jobUpdate },
          jobStatusHistory: { create: historyCreate },
        }),
      ),
    };

    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: {} as never,
      realtime: realtime as never,
      notifications: { recordCustomerNotification, sendCustomerPush } as never,
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return {
      jobs,
      jobFindFirst,
      historyCreate,
      jobUpdate,
      realtime,
      sendCustomerPush,
      recordCustomerNotification,
    };
  }

  it('confirms arrival when the pro is within the arrival radius', async () => {
    const ctx = buildTransition();

    const result = await ctx.jobs.transitionJob('user-1', 'job-1', 'arrived', undefined, {
      latitude: 12.9756, // same work spot
      longitude: 77.6099,
    });

    expect(ctx.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.ARRIVED }),
      }),
    );
    expect(result.status).toBe(JobStatus.ARRIVED);
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'cust-user-1',
      jobId: 'job-1',
      title: 'Arrived',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
  });

  it('rejects confirming arrival beyond the arrival radius and leaves the job TRAVELLING', async () => {
    const ctx = buildTransition();

    // ~2.5 km north of the work spot.
    await expect(
      ctx.jobs.transitionJob('user-1', 'job-1', 'arrived', undefined, {
        latitude: 12.9999,
        longitude: 77.6099,
      }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 400 });

    expect(ctx.jobUpdate).not.toHaveBeenCalled();
    expect(ctx.jobFindFirst).toHaveBeenCalledTimes(1);
  });

  it('fails closed when live coordinates are missing for arrived', async () => {
    const ctx = buildTransition();

    await expect(ctx.jobs.transitionJob('user-1', 'job-1', 'arrived')).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
    });
    expect(ctx.jobUpdate).not.toHaveBeenCalled();
  });

  it('issues a single start code on the Start Work swipe and stays ARRIVED until verified', async () => {
    const ctx = buildTransition();
    ctx.jobFindFirst.mockResolvedValue({ ...travellingRow, status: JobStatus.ARRIVED });

    await ctx.jobs.transitionJob('user-1', 'job-1', 'start');

    // One update mints the code WITHOUT touching the status (the job only
    // moves to IN_PROGRESS once the pro verifies it in a later step).
    expect(ctx.jobUpdate).toHaveBeenCalledTimes(1);
    expect(ctx.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verificationOtp: expect.stringMatching(/^\d{4}$/),
          otpIssuedAt: expect.any(Date),
        }),
      }),
    );
    expect(ctx.jobUpdate.mock.calls[0][0].data).not.toHaveProperty('status');
    // The code is pushed to the customer and a notice is recorded — never
    // returned to the pro's view (the pro view path sets it to null).
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-user-1', jobId: 'job-1' }),
    );
    expect(ctx.recordCustomerNotification).toHaveBeenCalledWith(
      expect.objectContaining({ customerUserId: 'cust-user-1', kind: NotificationKind.JOB_STATUS }),
    );
  });

  it('is a no-op on a repeat Start Work swipe — one job, one code, no re-send', async () => {
    const ctx = buildTransition();
    ctx.jobFindFirst.mockResolvedValue({
      ...travellingRow,
      status: JobStatus.ARRIVED,
      verificationOtp: '1234',
    });

    const result = await ctx.jobs.transitionJob('user-1', 'job-1', 'start');

    expect(ctx.jobUpdate).not.toHaveBeenCalled();
    expect(ctx.sendCustomerPush).not.toHaveBeenCalled();
    expect(result.status).toBe(JobStatus.ARRIVED);
  });

  it('stops work at COMPLETED, anchoring the price, without jumping to PAYMENT_PENDING', async () => {
    const ctx = buildTransition();
    ctx.jobFindFirst.mockResolvedValue({
      ...travellingRow,
      status: JobStatus.IN_PROGRESS,
      agreedPayPaise: 20_000,
    });

    const result = await ctx.jobs.transitionJob('user-1', 'job-1', 'complete');

    expect(ctx.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobStatus.COMPLETED,
          finalPayPaise: 20_000,
        }),
      }),
    );
    expect(result.status).toBe(JobStatus.COMPLETED);
    // A single history row (IN_PROGRESS → COMPLETED); no PAYMENT_PENDING write.
    expect(ctx.historyCreate).toHaveBeenCalledTimes(1);
    expect(ctx.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: JobStatus.COMPLETED }),
      }),
    );
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'cust-user-1',
      jobId: 'job-1',
      title: 'Work complete',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
  });
});

describe('createJobsService.verifyStart', () => {
  /** An ARRIVED job the pro reached, with a start code already issued. */
  const arrivedRow = {
    ...jobRow,
    proId: 'pro-1',
    status: JobStatus.ARRIVED,
    verificationOtp: '4821',
    customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
    pro: { userId: 'user-1', displayName: 'Pro', profile: { phone: null } },
  };

  function buildVerify() {
    const jobFindFirst = jest.fn().mockResolvedValue(arrivedRow);
    const historyCreate = jest.fn().mockResolvedValue({});
    const jobUpdate = jest.fn().mockImplementation(
      async (args: {
        data: {
          status?: JobStatus;
          verificationOtp?: string | null;
          startOtpAttempts?: number | { increment: number };
        };
      }) => ({
        ...arrivedRow,
        status: args.data.status ?? arrivedRow.status,
        verificationOtp: args.data.verificationOtp ?? arrivedRow.verificationOtp,
        startOtpAttempts:
          typeof args.data.startOtpAttempts === 'number'
            ? args.data.startOtpAttempts
            : (args.data.startOtpAttempts?.increment ?? 0),
      }),
    );
    const recordCustomerNotification = jest.fn().mockResolvedValue(undefined);
    const sendCustomerPush = jest.fn().mockResolvedValue(undefined);
    const jobUpdateNoTx = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      proProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'pro-1', userId: 'user-1' }) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          job: { findFirst: jobFindFirst, update: jobUpdate },
          jobStatusHistory: { create: historyCreate },
        }),
      ),
      // The pre-transaction read in verifyStart uses prisma.job directly.
      job: { findFirst: jest.fn().mockResolvedValue(arrivedRow), update: jobUpdateNoTx },
    };

    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };
    const reset = jest.fn().mockResolvedValue(undefined);
    const recordFailure = jest.fn().mockResolvedValue({ locked: false, retryAfterSeconds: 0 });
    const check = jest
      .fn()
      .mockResolvedValue({ locked: false, retryAfterSeconds: 0, attemptsRemaining: 5 });
    const startOtpGuard = { check, recordFailure, reset };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: {} as never,
      realtime: realtime as never,
      notifications: { recordCustomerNotification, sendCustomerPush } as never,
      startOtpGuard: startOtpGuard as never,
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return {
      jobs,
      prisma,
      jobFindFirst,
      historyCreate,
      jobUpdate,
      jobUpdateNoTx,
      realtime,
      recordCustomerNotification,
      sendCustomerPush,
      startOtpGuard,
    };
  }

  it('advances ARRIVED → IN_PROGRESS when the pro enters the customer code', async () => {
    const ctx = buildVerify();

    const result = await ctx.jobs.verifyStart('user-1', 'job-1', '4821');

    expect(ctx.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.IN_PROGRESS, verificationOtp: null }),
      }),
    );
    expect(ctx.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: JobStatus.IN_PROGRESS }),
      }),
    );
    expect(result.status).toBe(JobStatus.IN_PROGRESS);
    expect(ctx.startOtpGuard.reset).toHaveBeenCalledWith('job:job-1');
    expect(ctx.recordCustomerNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Work started' }),
    );
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'cust-user-1',
      jobId: 'job-1',
      title: 'Work started',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
  });

  it('rejects a wrong code, counts the failure, and leaves the job ARRIVED', async () => {
    const ctx = buildVerify();

    await expect(ctx.jobs.verifyStart('user-1', 'job-1', '0000')).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
    });

    expect(ctx.startOtpGuard.recordFailure).toHaveBeenCalledWith('job:job-1');
    expect(ctx.jobUpdateNoTx).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startOtpAttempts: { increment: 1 } }),
      }),
    );
    // No status change in the write transaction.
    expect(ctx.jobUpdate).not.toHaveBeenCalled();
  });

  it('fails closed when no code has been issued yet', async () => {
    const ctx = buildVerify();
    ctx.prisma?.job.findFirst.mockResolvedValue({ ...arrivedRow, verificationOtp: null });

    await expect(ctx.jobs.verifyStart('user-1', 'job-1', '4821')).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
      message: expect.stringContaining('No verification code has been issued yet'),
    });
    expect(ctx.jobUpdate).not.toHaveBeenCalled();
  });

  it('refuses verification once the job has left ARRIVED', async () => {
    const ctx = buildVerify();
    ctx.prisma?.job.findFirst.mockResolvedValue({ ...arrivedRow, status: JobStatus.IN_PROGRESS });

    await expect(ctx.jobs.verifyStart('user-1', 'job-1', '4821')).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
    });
    expect(ctx.jobUpdate).not.toHaveBeenCalled();
  });

  it('locks out further attempts once the per-identity guard is tripped', async () => {
    const ctx = buildVerify();
    ctx.startOtpGuard.check.mockResolvedValue({
      locked: true,
      retryAfterSeconds: 900,
      attemptsRemaining: 0,
    });

    await expect(ctx.jobs.verifyStart('user-1', 'job-1', '4821')).rejects.toMatchObject({
      name: 'HttpError',
      status: 429,
    });
    expect(ctx.jobUpdate).not.toHaveBeenCalled();
  });
});

describe('createJobsService.collectCashForPro', () => {
  /** A completed job the pro finished, with the price anchored. */
  const completedRow = {
    ...jobRow,
    proId: 'pro-1',
    status: JobStatus.COMPLETED,
    finalPayPaise: 15_000,
    verificationOtp: null,
    customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
    pro: { userId: 'user-1', displayName: 'Pro', profile: { phone: null } },
  };

  function buildCollect() {
    let row: Omit<typeof completedRow, 'status'> & { status: JobStatus } = completedRow;
    const jobFindFirst = jest.fn().mockImplementation(async () => row);
    const historyCreate = jest.fn().mockResolvedValue({});
    const jobUpdate = jest
      .fn()
      .mockImplementation(async (args: { data: { status: JobStatus } }) => {
        row = { ...row, status: args.data.status };
        return row;
      });
    const proProfileUpdate = jest.fn().mockResolvedValue({ id: 'pro-1' });
    const jobFindFirstOrThrow = jest.fn().mockImplementation(async () => row);
    const recordCustomerNotification = jest.fn().mockResolvedValue(undefined);
    const sendCustomerPush = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      proProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pro-1', userId: 'user-1' }),
        update: proProfileUpdate,
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          job: {
            findFirst: jobFindFirst,
            update: jobUpdate,
            findFirstOrThrow: jobFindFirstOrThrow,
          },
          jobStatusHistory: { create: historyCreate },
          proProfile: { update: proProfileUpdate },
        }),
      ),
    };

    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: {} as never,
      realtime: realtime as never,
      notifications: { recordCustomerNotification, sendCustomerPush } as never,
      config: { jobExpireTtlMs: 30 * 60_000 } as never,
    } as never);

    return {
      jobs,
      setRow: (next: typeof completedRow | { status: JobStatus; [k: string]: unknown }) => {
        row = { ...completedRow, ...next } as typeof completedRow;
      },
      jobFindFirst,
      historyCreate,
      jobUpdate,
      proProfileUpdate,
      jobFindFirstOrThrow,
      realtime,
      recordCustomerNotification,
      sendCustomerPush,
    };
  }

  it('settles a completed job through PAYMENT_PENDING to PAID', async () => {
    const ctx = buildCollect();

    const result = await ctx.jobs.collectCashForPro('user-1', 'job-1');

    expect(result).toMatchObject({ id: 'job-1', status: JobStatus.PAID });
    // The two audit rows the online settle would have produced.
    expect(ctx.historyCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: JobStatus.COMPLETED,
          toStatus: JobStatus.PAYMENT_PENDING,
          changedById: 'user-1',
        }),
      }),
    );
    expect(ctx.historyCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: JobStatus.PAYMENT_PENDING,
          toStatus: JobStatus.PAID,
          changedById: 'user-1',
        }),
      }),
    );
    expect(ctx.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: JobStatus.PAID } }),
    );
    expect(ctx.proProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { completedJobs: { increment: 1 } } }),
    );
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(2);
    expect(ctx.recordCustomerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: NotificationKind.PAYMENT,
        title: 'Payment received · ₹150',
      }),
    );
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'cust-user-1',
      jobId: 'job-1',
      title: 'Payment received · ₹150',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
  });

  it('accepts a job already sitting in PAYMENT_PENDING', async () => {
    const ctx = buildCollect();
    ctx.setRow({ status: JobStatus.PAYMENT_PENDING });

    const result = await ctx.jobs.collectCashForPro('user-1', 'job-1');

    expect(result).toMatchObject({ status: JobStatus.PAID });
    // Only the PAYMENT_PENDING → PAID row (no COMPLETED → PAYMENT_PENDING, which
    // the job already passed).
    expect(ctx.historyCreate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op once the job is already paid', async () => {
    const ctx = buildCollect();
    ctx.setRow({ status: JobStatus.PAID });

    const result = await ctx.jobs.collectCashForPro('user-1', 'job-1');

    expect(result).toMatchObject({ status: JobStatus.PAID });
    expect(ctx.historyCreate).not.toHaveBeenCalled();
    expect(ctx.proProfileUpdate).not.toHaveBeenCalled();
  });

  it('refuses to collect cash before the work is done', async () => {
    const ctx = buildCollect();
    ctx.setRow({ status: JobStatus.IN_PROGRESS });

    await expect(ctx.jobs.collectCashForPro('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
    });
    expect(ctx.historyCreate).not.toHaveBeenCalled();
  });

  it('404s when the job belongs to another pro', async () => {
    const ctx = buildCollect();
    ctx.jobFindFirst.mockResolvedValue(null);

    await expect(ctx.jobs.collectCashForPro('user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(ctx.historyCreate).not.toHaveBeenCalled();
  });
});

describe('createJobsService.cancelJob', () => {
  /**
   * An arrived job with both sides assigned.
   *
   * The final stage a pro may tear out of — beyond it (IN_PROGRESS onwards)
   * the job is locked to both parties. A customer may still cancel up to the
   * same point; a pro-cancel at/under ARRIVED now releases the job to the pool.
   */
  const arrivedRow = {
    ...jobRow,
    serviceId: 'svc-1',
    expiresAt: null,
    proId: 'pro-1',
    status: JobStatus.ARRIVED,
    finalPayPaise: 15_000,
    verificationOtp: '1234',
    customer: { userId: 'cust-user-1', displayName: 'Cust', profile: { phone: null } },
    pro: {
      id: 'pro-1',
      userId: 'user-1',
      displayName: 'Pro',
      rating: null,
      profile: { phone: null },
    },
  };

  function buildCancel() {
    let row: Omit<typeof arrivedRow, 'status'> & { status: JobStatus } = arrivedRow;
    const jobFindUnique = jest.fn().mockImplementation(async () => row);
    const historyCreate = jest.fn().mockResolvedValue({});
    const jobUpdate = jest
      .fn()
      .mockImplementation(async (args: { data: { status: JobStatus; cancelledAt: Date } }) => {
        row = { ...row, ...args.data };
        return row;
      });
    // updateMany drives the release path; the mutated row stands in for the
    // post-transaction re-read (findFirstOrThrow) of the released job.
    const jobUpdateMany = jest
      .fn()
      .mockImplementation(async (args: { data: Record<string, unknown> }) => {
        row = { ...row, ...args.data };
        return { count: 1 };
      });
    const jobFindFirstOrThrow = jest.fn().mockImplementation(async () => row);
    const declineUpsert = jest.fn().mockResolvedValue({});
    const messageDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const recordCustomerNotification = jest.fn().mockResolvedValue(undefined);
    const sendCustomerPush = jest.fn().mockResolvedValue(undefined);
    const resolveJobAlerts = jest.fn().mockResolvedValue(undefined);
    const sendAssignedCancellationProPush = jest.fn().mockResolvedValue(undefined);
    const reAlertEligiblePros = jest.fn().mockResolvedValue(undefined);
    const findEligiblePros = jest.fn().mockResolvedValue([]);
    const notificationFindMany = jest.fn().mockResolvedValue([]);

    const prisma = {
      job: { findUnique: jobFindUnique, update: jobUpdate },
      jobStatusHistory: { create: historyCreate },
      jobDecline: { upsert: declineUpsert },
      message: { deleteMany: messageDeleteMany },
      notification: { findMany: notificationFindMany },
      proProfile: { findUnique: jest.fn().mockResolvedValue({ isOnline: false }) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          job: {
            update: jobUpdate,
            updateMany: jobUpdateMany,
            findFirstOrThrow: jobFindFirstOrThrow,
          },
          jobStatusHistory: { create: historyCreate },
          jobDecline: { upsert: declineUpsert },
          message: { deleteMany: messageDeleteMany },
        }),
      ),
    };

    const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };
    const storage = {
      jobImagePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
      selfiePublicUrl: jest.fn().mockImplementation((p: string) => `https://cdn/${p}`),
    };
    const matching = { findEligiblePros };
    const notifications = {
      recordCustomerNotification,
      sendCustomerPush,
      resolveJobAlerts,
      sendAssignedCancellationProPush,
      reAlertEligiblePros,
    };

    const jobs = createJobsService({
      prisma: prisma as never,
      storage: storage as never,
      matching: matching as never,
      realtime: realtime as never,
      notifications: notifications as never,
      config: { jobExpireTtlMs: 30 * 60_000, jobAlertRearmCooldownMs: 5 * 60_000 } as never,
    } as never);

    return {
      jobs,
      setRow: (next: { status?: JobStatus; [k: string]: unknown }) => {
        row = { ...arrivedRow, ...next } as Omit<typeof arrivedRow, 'status'> & { status: JobStatus };
      },
      jobFindUnique,
      historyCreate,
      jobUpdate,
      jobUpdateMany,
      declineUpsert,
      messageDeleteMany,
      realtime,
      findEligiblePros,
      reAlertEligiblePros,
      recordCustomerNotification,
      sendCustomerPush,
      resolveJobAlerts,
      sendAssignedCancellationProPush,
      notificationFindMany,
    };
  }

  it('lets the customer cancel at ARRIVED', async () => {
    const ctx = buildCancel();

    const result = await ctx.jobs.cancelJob('cust-user-1', 'job-1');

    expect(result).toMatchObject({
      detail: expect.objectContaining({ status: JobStatus.CANCELLED }),
      customerUserId: 'cust-user-1',
      proUserId: 'user-1',
    });
    expect(ctx.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: JobStatus.ARRIVED,
          toStatus: JobStatus.CANCELLED,
          changedById: 'cust-user-1',
        }),
      }),
    );
    expect(ctx.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.CANCELLED }),
      }),
    );
    // Both sides were told in realtime.
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(2);
    // The cancellation's realtime payload names the actor so the pro's app can
    // tell a customer walk-away from the pro's own cancel.
    expect(ctx.realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'job:status',
      expect.objectContaining({
        id: 'job-1',
        status: JobStatus.CANCELLED,
        cancelledBy: 'customer',
        cancelledAt: expect.any(String),
      }),
    );
    // The pro is not holding an offer alert (they already accepted), so the
    // assigned pro is paged directly and the terminal resolve is untouched.
    expect(ctx.resolveJobAlerts).toHaveBeenCalledWith('job-1', 'CANCELLED');
    expect(ctx.sendAssignedCancellationProPush).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      expect.any(Date),
    );
    // The customer cancelling is their own act — no customer notice.
    expect(ctx.recordCustomerNotification).not.toHaveBeenCalled();
  });

  it('pages every alerted pro in realtime when an open (unassigned) job is cancelled', async () => {
    const ctx = buildCancel();
    ctx.setRow({ proId: null, pro: null });
    ctx.notificationFindMany.mockResolvedValue([
      { pro: { userId: 'pro-alert-1' } },
      { pro: { userId: 'pro-alert-2' } },
    ]);

    const result = await ctx.jobs.cancelJob('cust-user-1', 'job-1');

    expect(result).toMatchObject({ proUserId: null });
    // Only the customer holds the open request; no assigned pro to page.
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(1);
    // The open pool holders are told over realtime so their pools drop the
    // dead request immediately, and the terminal resolve still runs.
    expect(ctx.notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: 'job-1', kind: NotificationKind.JOB_ALERT },
      }),
    );
    expect(ctx.realtime.emitToUsers).toHaveBeenCalledWith(
      ['pro-alert-1', 'pro-alert-2'],
      'job:status',
      expect.objectContaining({
        id: 'job-1',
        status: JobStatus.CANCELLED,
        cancelledBy: 'customer',
        cancelledAt: expect.any(String),
        // No pro was ever assigned — the detail carries no pro identity.
        pro: null,
      }),
    );
    expect(ctx.resolveJobAlerts).toHaveBeenCalledWith('job-1', 'CANCELLED');
    // Nobody was assigned, so no dedicated assigned-pro push fires.
    expect(ctx.sendAssignedCancellationProPush).not.toHaveBeenCalled();
  });

  it('lets the pro release at ARRIVED and tells the customer the booking is re-listed', async () => {
    const ctx = buildCancel();

    const result = await ctx.jobs.cancelJob('user-1', 'job-1');

    expect(result).toMatchObject({
      detail: expect.objectContaining({ status: JobStatus.REQUESTED }),
      customerUserId: 'cust-user-1',
      proUserId: 'user-1',
    });
    expect(ctx.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: JobStatus.ARRIVED,
          toStatus: JobStatus.REQUESTED,
          changedById: 'user-1',
        }),
      }),
    );
    // Not a cancellation write — the job is stripped back to a clean open state
    // with a fresh offer window so another pro can still take the work.
    const data = ctx.jobUpdateMany.mock.calls[0][0].data;
    expect(ctx.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'job-1',
          proId: 'pro-1',
          status: { in: [JobStatus.ACCEPTED, JobStatus.TRAVELLING, JobStatus.ARRIVED] },
        }),
        data: expect.objectContaining({
          status: JobStatus.REQUESTED,
          proId: null,
          agreedPayPaise: null,
          finalPayPaise: null,
          verificationOtp: null,
          startOtpAttempts: 0,
          cancelledAt: null,
          completedAt: null,
        }),
      }),
    );
    expect(data.expiresAt).toBeInstanceOf(Date);
    // The releasing pro is barred from re-grabbing the job they just handed back.
    expect(ctx.declineUpsert).toHaveBeenCalledWith({
      where: { jobId_proId: { jobId: 'job-1', proId: 'pro-1' } },
      create: { jobId: 'job-1', proId: 'pro-1' },
      update: {},
    });
    // The previous pro's chat is wiped so it never leaks to whoever accepts next.
    expect(ctx.messageDeleteMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    // Both sides see the job as open again in realtime.
    expect(ctx.realtime.emitToUser).toHaveBeenCalledTimes(2);
    // It is a release, not a cancellation: no offer resolution, no cancel push.
    expect(ctx.resolveJobAlerts).not.toHaveBeenCalled();
    expect(ctx.sendAssignedCancellationProPush).not.toHaveBeenCalled();
    // The customer hears the booking is back in the marketplace — not cancelled.
    expect(ctx.recordCustomerNotification).toHaveBeenCalled();
    expect(ctx.sendCustomerPush).toHaveBeenCalledWith({
      userId: 'cust-user-1',
      jobId: 'job-1',
      title: 'Finding a new professional',
      body: expect.stringContaining('Electrical'),
      type: 'JOB_STATUS',
    });
  });

  it('releases from every pre-work state a pro may hold: ACCEPTED, TRAVELLING, ARRIVED', async () => {
    for (const status of [JobStatus.ACCEPTED, JobStatus.TRAVELLING, JobStatus.ARRIVED]) {
      const ctx = buildCancel();
      ctx.setRow({ status, proId: 'pro-1', acceptedAt: new Date('2026-08-28T00:00:00Z') });

      const result = await ctx.jobs.cancelJob('user-1', 'job-1');

      expect(result.detail.status).toBe(JobStatus.REQUESTED);
      const data = ctx.jobUpdateMany.mock.calls[0][0].data;
      expect(data.status).toBe(JobStatus.REQUESTED);
      expect(data.proId).toBeNull();
      expect(data.expiresAt).toBeInstanceOf(Date);
      expect(ctx.historyCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromStatus: status, toStatus: JobStatus.REQUESTED }),
        }),
      );
    }
  });

  it('re-offers the released job to other eligible pros with a cooldown-gated alert', async () => {
    const ctx = buildCancel();
    ctx.setRow({ status: JobStatus.ACCEPTED, latitude: 12.972, longitude: 77.594 });
    ctx.findEligiblePros.mockResolvedValue([
      { proId: 'pro-2', userId: 'user-2', distanceKm: 1.2 },
      { proId: 'pro-3', userId: 'user-3', distanceKm: 2.4 },
    ]);

    await ctx.jobs.cancelJob('user-1', 'job-1');

    expect(ctx.findEligiblePros).toHaveBeenCalledWith({
      serviceId: 'svc-1',
      latitude: 12.972,
      longitude: 77.594,
    });
    expect(ctx.realtime.emitToUsers).toHaveBeenCalledWith(
      ['user-2', 'user-3'],
      REALTIME_EVENTS.JOB_NEW,
      expect.objectContaining({ id: 'job-1', status: JobStatus.REQUESTED }),
    );
    // The re-alert re-arms within the per-pro cooldown so a pro who was just
    // paged for this job is not bombarded the instant it returns to the pool.
    expect(ctx.reAlertEligiblePros).toHaveBeenCalledWith(
      [
        { proId: 'pro-2', distanceKm: 1.2 },
        { proId: 'pro-3', distanceKm: 2.4 },
      ],
      expect.objectContaining({ jobId: 'job-1', serviceName: 'Electrical' }),
      5 * 60_000,
    );
  });

  it('never re-offers the job back to the releasing pro', async () => {
    const ctx = buildCancel();
    ctx.setRow({ status: JobStatus.ARRIVED, latitude: 12.972, longitude: 77.594 });
    ctx.findEligiblePros.mockResolvedValue([
      { proId: 'pro-1', userId: 'user-1', distanceKm: 0 },
      { proId: 'pro-2', userId: 'user-2', distanceKm: 1.2 },
    ]);

    await ctx.jobs.cancelJob('user-1', 'job-1');

    expect(ctx.realtime.emitToUsers).toHaveBeenCalledWith(
      ['user-2'],
      REALTIME_EVENTS.JOB_NEW,
      expect.anything(),
    );
    expect(ctx.reAlertEligiblePros).toHaveBeenCalledWith(
      [{ proId: 'pro-2', distanceKm: 1.2 }],
      expect.anything(),
      5 * 60_000,
    );
  });

  it('blocks cancellation once the work has started, for both sides', async () => {
    for (const status of [JobStatus.IN_PROGRESS, JobStatus.PAYMENT_PENDING]) {
      for (const actor of ['cust-user-1', 'user-1']) {
        const ctx = buildCancel();
        ctx.setRow({ status });

        await expect(ctx.jobs.cancelJob(actor, 'job-1')).rejects.toMatchObject({
          name: 'HttpError',
          status: 409,
        });
        expect(ctx.historyCreate).not.toHaveBeenCalled();
        expect(ctx.jobUpdate).not.toHaveBeenCalled();
      }
    }
  });

  it('404s when the job does not exist', async () => {
    const ctx = buildCancel();
    ctx.jobFindUnique.mockResolvedValue(null);

    await expect(ctx.jobs.cancelJob('cust-user-1', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
  });

  it('403s when the caller is not part of the job', async () => {
    const ctx = buildCancel();

    await expect(ctx.jobs.cancelJob('stranger-user', 'job-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 403,
    });
    expect(ctx.historyCreate).not.toHaveBeenCalled();
  });
});

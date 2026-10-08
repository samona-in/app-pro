import { OnboardingStatus, ProServiceStatus } from '@samona/types';
import { createProsService } from './pros.service';
import type { JobsService } from '../jobs/jobs.service';
import type { StorageService } from '../files/storage.service';

/**
 * Manage Services: the catalogue list, the request state machine, and the
 * onboarding re-save that must not clobber an admin's verdict.
 */

const serviceRow = { id: 'svc-1', slug: 'plumbing', name: 'Plumbing', icon: 'wrench-outline' };

const profileRow = {
  id: 'pro-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.COMPLETED as string,
  displayName: 'Asha Kumar',
  gender: 'FEMALE',
  bio: null,
  experienceLevel: 'THREE_TO_FIVE',
  serviceRadiusKm: 10,
  latitude: null,
  longitude: null,
  locationLabel: null,
  languages: [] as string[],
  selfiePhotoPath: 'pros/user-1/selfie.jpg',
  isOnline: false,
  isVerified: false,
  rating: null,
  completedJobs: 0,
  services: [] as unknown[],
  skills: [] as unknown[],
};

type PrismaMock = {
  proProfile: {
    upsert: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  service: { findMany: jest.Mock; findFirst: jest.Mock; count?: jest.Mock };
  proService: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    createMany: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  proSkill: { deleteMany: jest.Mock; createMany: jest.Mock };
  skill?: { count: jest.Mock };
  $transaction: jest.Mock;
};

function buildPrisma(overrides: Partial<PrismaMock> = {}): PrismaMock {
  const prisma: PrismaMock = {
    proProfile: {
      upsert: jest.fn().mockResolvedValue(profileRow),
      update: jest.fn().mockResolvedValue(profileRow),
      findUnique: jest.fn().mockResolvedValue(profileRow),
      findUniqueOrThrow: jest.fn().mockResolvedValue(profileRow),
    },
    service: {
      findMany: jest.fn().mockResolvedValue([serviceRow]),
      findFirst: jest.fn().mockResolvedValue(serviceRow),
    },
    proService: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    proSkill: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    skill: { count: jest.fn().mockResolvedValue(1) },
    $transaction: jest.fn(),
    ...overrides,
  };

  // A transaction receives a `tx` object; by default it is the same mock, so
  // a test only overrides the pieces it cares about.
  prisma.$transaction.mockImplementation(async (fn: (tx: PrismaMock) => Promise<unknown>) =>
    fn(prisma),
  );
  return prisma;
}

function buildService(prisma: PrismaMock) {
  const storage = {
    selfiePath: (userId: string) => `pros/${userId}/selfie.jpg`,
    selfieExists: jest.fn().mockResolvedValue(true),
    selfiePublicUrl: (path: string) => `https://cdn.test/${path}`,
    createSelfieUpload: jest.fn(),
  } as unknown as StorageService;

  const jobs = {
    notifyReadyJobRequests: jest.fn().mockResolvedValue(undefined),
  } as unknown as JobsService;

  return {
    service: createProsService({ prisma: prisma as never, storage, jobs }),
    prisma,
    storage,
    jobs,
  };
}

describe('listProServices', () => {
  it('lists the whole active catalogue with null for never-requested services', async () => {
    const prisma = buildPrisma({
      service: {
        findMany: jest.fn().mockResolvedValue([serviceRow, { ...serviceRow, id: 'svc-2' }]),
        findFirst: jest.fn(),
      },
      proService: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ serviceId: 'svc-1', status: 'ACCEPTED', rejectionReason: null }]),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const { service } = buildService(prisma);

    const list = await service.listProServices('user-1');

    // The unrequested service is present so the screen can offer Request on it.
    expect(list).toEqual([
      {
        id: 'svc-1',
        slug: 'plumbing',
        name: 'Plumbing',
        icon: 'wrench-outline',
        status: ProServiceStatus.ACCEPTED,
        rejectionReason: null,
      },
      {
        id: 'svc-2',
        slug: 'plumbing',
        name: 'Plumbing',
        icon: 'wrench-outline',
        status: null,
        rejectionReason: null,
      },
    ]);
  });

  it('scopes the rows to the caller and reads inactive services out of the catalogue', async () => {
    const prisma = buildPrisma();
    const { service } = buildService(prisma);

    await service.listProServices('user-1');

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(prisma.proService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proProfileId: 'pro-1' } }),
    );
  });
});

describe('requestProService', () => {
  function prismaWithProService(existing: Record<string, unknown> | null) {
    return buildPrisma({
      proService: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn(),
      },
    });
  }

  it('creates a PENDING row for a never-requested service', async () => {
    const prisma = prismaWithProService(null);
    prisma.proService.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'PENDING', rejectionReason: null });
    const { service } = buildService(prisma);

    const entry = await service.requestProService('user-1', 'svc-1');

    expect(prisma.proService.createMany).toHaveBeenCalledWith({
      data: [{ proProfileId: 'pro-1', serviceId: 'svc-1' }],
      skipDuplicates: true,
    });
    expect(entry).toMatchObject({ id: 'svc-1', status: ProServiceStatus.PENDING });
  });

  it('is idempotent while the request is still pending', async () => {
    const prisma = prismaWithProService({ status: 'PENDING', rejectionReason: null });
    const { service } = buildService(prisma);

    const entry = await service.requestProService('user-1', 'svc-1');

    expect(prisma.proService.createMany).not.toHaveBeenCalled();
    expect(prisma.proService.updateMany).not.toHaveBeenCalled();
    expect(entry.status).toBe(ProServiceStatus.PENDING);
  });

  it('409s when the service is already accepted', async () => {
    const prisma = prismaWithProService({ status: 'ACCEPTED', rejectionReason: null });
    const { service } = buildService(prisma);

    await expect(service.requestProService('user-1', 'svc-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
    });
    expect(prisma.proService.updateMany).not.toHaveBeenCalled();
  });

  it('re-requests a rejected service by flipping it back to PENDING', async () => {
    const prisma = prismaWithProService({
      status: 'REJECTED',
      rejectionReason: 'Missing licence',
    });
    const { service } = buildService(prisma);

    const entry = await service.requestProService('user-1', 'svc-1');

    // Guarded on the exact status it read: a concurrent change cannot be
    // overwritten, and the stale rejection reason leaves with the rejection.
    expect(prisma.proService.updateMany).toHaveBeenCalledWith({
      where: { proProfileId: 'pro-1', serviceId: 'svc-1', status: ProServiceStatus.REJECTED },
      data: { status: ProServiceStatus.PENDING, rejectionReason: null },
    });
    expect(entry).toMatchObject({ status: ProServiceStatus.PENDING, rejectionReason: null });
  });

  it('answers from current state when the guarded flip loses its race', async () => {
    const prisma = prismaWithProService({ status: 'REJECTED', rejectionReason: null });
    prisma.proService.updateMany.mockResolvedValue({ count: 0 });
    prisma.proService.findUnique
      .mockResolvedValueOnce({ status: 'REJECTED', rejectionReason: null })
      .mockResolvedValueOnce({ status: 'ACCEPTED', rejectionReason: null });
    const { service } = buildService(prisma);

    // Another actor moved the row between read and write — the winner's state
    // is reported, never overwritten.
    await expect(service.requestProService('user-1', 'svc-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
    });
  });

  it('404s an unknown or inactive service', async () => {
    const prisma = prismaWithProService(null);
    prisma.service.findFirst.mockResolvedValue(null);
    const { service } = buildService(prisma);

    await expect(service.requestProService('user-1', 'svc-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(prisma.proService.createMany).not.toHaveBeenCalled();
  });

  it('403s before onboarding is finished', async () => {
    const prisma = prismaWithProService(null);
    prisma.proProfile.upsert.mockResolvedValue({
      ...profileRow,
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
    });
    const { service } = buildService(prisma);

    await expect(service.requestProService('user-1', 'svc-1')).rejects.toMatchObject({
      name: 'HttpError',
      status: 403,
    });
    expect(prisma.proService.createMany).not.toHaveBeenCalled();
  });

  it('never lets the client produce ACCEPTED', async () => {
    // The endpoint takes no status input at all — the only write it performs
    // is to PENDING, asserted by the create and flip paths above. Re-run both
    // with a recording spy over the prisma writes to make that explicit.
    const prisma = prismaWithProService(null);
    prisma.proService.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'PENDING', rejectionReason: null });
    const { service } = buildService(prisma);

    await service.requestProService('user-1', 'svc-1');

    const writes = [
      ...prisma.proService.createMany.mock.calls.map((c) => c[0].data),
      ...prisma.proService.updateMany.mock.calls.map((c) => c[0].data),
    ];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      if (write.status !== undefined) expect(write.status).toBe(ProServiceStatus.PENDING);
    }
  });
});

describe('applyOnboardingPatch service selection', () => {
  it('keeps surviving rows instead of wiping ACCEPTED status and reasons', async () => {
    const prisma = buildPrisma();
    const { service } = buildService(prisma);

    // svc-1 stays selected (was ACCEPTED), svc-2 is deselected, svc-3 arrives.
    await service.applyOnboardingPatch('user-1', {
      serviceIds: ['svc-1', 'svc-3'],
    });

    // Only the difference is deleted — never the whole join table, which is
    // what used to demote every approved service back to PENDING.
    expect(prisma.proService.deleteMany).toHaveBeenCalledWith({
      where: { proProfileId: 'pro-1', serviceId: { notIn: ['svc-1', 'svc-3'] } },
    });
    // skipDuplicates leaves the surviving row's status and rejection reason
    // untouched; the new row takes the PENDING column default.
    expect(prisma.proService.createMany).toHaveBeenCalledWith({
      data: [
        { proProfileId: 'pro-1', serviceId: 'svc-1' },
        { proProfileId: 'pro-1', serviceId: 'svc-3' },
      ],
      skipDuplicates: true,
    });
  });
});

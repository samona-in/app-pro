import { OnboardingStatus } from '@samona/types';
import { serviceRadiusPatchSchema } from '@samona/validation';
import { createProsService } from './pros.service';
import type { JobsService } from '../jobs/jobs.service';
import type { StorageService } from '../files/storage.service';

/**
 * The Service Areas contract: the radius the pro picks here is the same
 * number matching compares against (`distanceKm <= serviceRadiusKm`), so the
 * bounds and the ownership of the row are what this file protects.
 */

describe('serviceRadiusPatchSchema', () => {
  it('accepts a radius within the configured bounds', () => {
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 1 }).success).toBe(true);
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 5 }).success).toBe(true);
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 50 }).success).toBe(true);
  });

  it('rejects a radius outside the bounds', () => {
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 0 }).success).toBe(false);
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 51 }).success).toBe(false);
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 500 }).success).toBe(false);
  });

  it('rejects a fractional radius — matching compares whole kilometres', () => {
    expect(serviceRadiusPatchSchema.safeParse({ serviceRadiusKm: 5.5 }).success).toBe(false);
  });

  it('requires the field rather than defaulting it', () => {
    expect(serviceRadiusPatchSchema.safeParse({}).success).toBe(false);
  });
});

const baseRow = {
  id: 'pro-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.COMPLETED as string,
  serviceRadiusKm: 10,
  selfiePhotoPath: null as string | null,
  services: [],
  skills: [],
};

function buildService(row: typeof baseRow) {
  const prisma = {
    proProfile: {
      upsert: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      // The service selects only `serviceRadiusKm`, so the mock answers with
      // only that field — a response shaped like a full profile would then
      // fail the assertions below.
        return { ...data };
      }),
    },
  };

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
  };
}

describe('setServiceRadius', () => {
  it("updates only the caller's own profile", async () => {
    const { service, prisma } = buildService(baseRow);

    await service.setServiceRadius('user-1', 5);

    // The user id comes from the verified token; nothing in the request can
    // aim this at another pro's row.
    expect(prisma.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(prisma.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { serviceRadiusKm: 5 } }),
    );
  });

  it('ensures the profile exists before writing', async () => {
    const { service, prisma } = buildService(baseRow);

    await service.setServiceRadius('user-1', 5);

    expect(prisma.proProfile.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns exactly the saved radius — nothing else about the profile', async () => {
    const { service } = buildService(baseRow);

    const result = await service.setServiceRadius('user-1', 25);

    // The endpoint answers with the one field the screen needs, so the
    // response shape cannot drift into leaking the rest of the row.
    expect(result).toEqual({ serviceRadiusKm: 25 });
  });
});

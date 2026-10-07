import { OnboardingStatus, ProServiceStatus } from '@samona/types';
import { createMatchingService } from './matching.service';

/**
 * The ACCEPTED-only gate: an admin's approval is what earns a pro requests.
 *
 * These assert the predicate itself — both query shapes must require
 * `status: ACCEPTED`, because a missed call site silently puts unapproved
 * services back into matching.
 */

const criteria = { serviceId: 'svc-1', latitude: 12.9716, longitude: 77.5946 };

function buildWith(findMany: jest.Mock, findFirst: jest.Mock) {
  const prisma = {
    proProfile: { findMany, findFirst },
  };
  return { matching: createMatchingService({ prisma: prisma as never }), prisma };
}

const eligiblePro = {
  id: 'pro-1',
  userId: 'user-1',
  displayName: 'Asha Kumar',
  rating: null,
  completedJobs: 0,
  latitude: 12.97,
  longitude: 77.59,
  serviceRadiusKm: 10,
};

describe('findEligiblePros', () => {
  it('only surfaces pros whose service row is ACCEPTED', async () => {
    const findMany = jest.fn().mockResolvedValue([eligiblePro]);
    const { matching, prisma } = buildWith(findMany, jest.fn());

    await matching.findEligiblePros(criteria);

    const where = prisma.proProfile.findMany.mock.calls[0][0].where;
    expect(where.services).toEqual({
      some: { serviceId: 'svc-1', status: ProServiceStatus.ACCEPTED },
    });
    // The rest of the eligibility predicate is unchanged.
    expect(where.isOnline).toBe(true);
    expect(where.onboardingStatus).toBe(OnboardingStatus.COMPLETED);
    expect(where.jobs).toEqual({ none: { status: { in: expect.any(Array) } } });
  });

  it('keeps the radius and nearest-first behaviour', async () => {
    const far = { ...eligiblePro, id: 'pro-far', latitude: 13.5, longitude: 78.2 };
    const near = { ...eligiblePro, id: 'pro-near', latitude: 12.972, longitude: 77.595 };
    const { matching } = buildWith(jest.fn().mockResolvedValue([far, near]), jest.fn());

    const result = await matching.findEligiblePros(criteria);

    // The far pro (~60 km) is outside their own 10 km radius; only the near
    // one survives, nearest first.
    expect(result.map((pro) => pro.proId)).toEqual(['pro-near']);
    expect(result[0]!.distanceKm).toBeLessThan(1);
  });

  it('returns nothing when no pro is eligible', async () => {
    const { matching } = buildWith(jest.fn().mockResolvedValue([]), jest.fn());
    expect(await matching.findEligiblePros(criteria)).toEqual([]);
  });
});

describe('isProEligible', () => {
  it('requires the service row to be ACCEPTED', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'pro-1',
      latitude: 12.97,
      longitude: 77.59,
      serviceRadiusKm: 10,
    });
    const { matching, prisma } = buildWith(jest.fn(), findFirst);

    const eligible = await matching.isProEligible('pro-1', criteria);

    expect(eligible).toBe(true);
    const where = prisma.proProfile.findFirst.mock.calls[0][0].where;
    expect(where.services).toEqual({
      some: { serviceId: 'svc-1', status: ProServiceStatus.ACCEPTED },
    });
  });

  it('excludes a pro without a matching profile row', async () => {
    const { matching } = buildWith(jest.fn(), jest.fn().mockResolvedValue(null));
    expect(await matching.isProEligible('pro-1', criteria)).toBe(false);
  });

  it('excludes a pro outside their own radius', async () => {
    const { matching } = buildWith(
      jest.fn(),
      jest
        .fn()
        .mockResolvedValue({ id: 'pro-1', latitude: 13.5, longitude: 78.2, serviceRadiusKm: 5 }),
    );
    expect(await matching.isProEligible('pro-1', criteria)).toBe(false);
  });
});

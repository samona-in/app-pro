import { OnboardingStatus, ProServiceStatus, ACTIVE_JOB_STATUSES } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import { distanceKm, etaMinutes } from '../common/geo';

export interface MatchingServiceDeps {
  prisma: PrismaClient;
}

/**
 * A pro the marketplace would like to surface this request to.
 */
export interface EligiblePro {
  /** pro_profiles.id — the join key for a job assignment. */
  proId: string;
  /** profiles.id — the account a socket/notification lands on. */
  userId: string;
  displayName: string | null;
  rating: number | null;
  completedJobs: number;
  /** Straight-line distance from the request, km. */
  distanceKm: number;
  /** Derived travel time at configured speed, minutes. */
  etaMinutes: number;
}

export interface MatchingCriteria {
  serviceId: string;
  /** The request location; matching is meaningless without it. */
  latitude: number;
  longitude: number;
  limit?: number;
}

/**
 * Matching domain service.
 *
 * Decides which professionals get to see a request: online, onboarded, serving
 * the requested service, inside their own service radius, without a conflicting
 * confirmed job. Internal domain service with no HTTP surface — jobs drives it.
 */
export function createMatchingService(deps: MatchingServiceDeps) {
  /**
   * Nearest eligible pros for a request, ordered by distance.
   *
   * Request coordinates are required: without them there is no "nearby",
   * which is the whole point of the marketplace.
   */
  async function findEligiblePros(criteria: MatchingCriteria): Promise<EligiblePro[]> {
    const candidates = await deps.prisma.proProfile.findMany({
      where: {
        isOnline: true,
        onboardingStatus: OnboardingStatus.COMPLETED,
        latitude: { not: null },
        longitude: { not: null },
        // Only an admin-approved service earns requests: PENDING selections
        // from onboarding and REJECTED ones must not match.
        services: { some: { serviceId: criteria.serviceId, status: ProServiceStatus.ACCEPTED } },
        // A pro already heading to a job cannot accept another.
        jobs: { none: { status: { in: [...ACTIVE_JOB_STATUSES] } } },
      },
      select: {
        id: true,
        userId: true,
        displayName: true,
        rating: true,
        completedJobs: true,
        latitude: true,
        longitude: true,
        serviceRadiusKm: true,
      },
    });

    const request = { latitude: criteria.latitude, longitude: criteria.longitude };

    const eligible = candidates
      .map((pro) => {
        const proPoint = { latitude: pro.latitude as number, longitude: pro.longitude as number };
        const km = distanceKm(request, proPoint);
        return { pro, km };
      })
      // Inside their own service radius earns them the request at all.
      .filter(({ pro, km }) => km <= pro.serviceRadiusKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, criteria.limit ?? Number.MAX_SAFE_INTEGER)
      .map(({ pro, km }) => ({
        proId: pro.id,
        userId: pro.userId,
        displayName: pro.displayName,
        rating: pro.rating,
        completedJobs: pro.completedJobs,
        distanceKm: km,
        etaMinutes: etaMinutes(km),
      }));

    return eligible;
  }

  /**
   * Whether a pro may take a request right now: online, onboarded, serving the
   * service, inside their radius, no conflicting job.
   */
  async function isProEligible(proId: string, criteria: MatchingCriteria): Promise<boolean> {
    const matches = await deps.prisma.proProfile.findFirst({
      where: {
        id: proId,
        isOnline: true,
        onboardingStatus: OnboardingStatus.COMPLETED,
        latitude: { not: null },
        longitude: { not: null },
        services: { some: { serviceId: criteria.serviceId, status: ProServiceStatus.ACCEPTED } },
        jobs: { none: { status: { in: [...ACTIVE_JOB_STATUSES] } } },
      },
      select: { id: true, latitude: true, longitude: true, serviceRadiusKm: true },
    });

    if (!matches || matches.latitude === null || matches.longitude === null) return false;

    const km = distanceKm(
      { latitude: criteria.latitude, longitude: criteria.longitude },
      { latitude: matches.latitude, longitude: matches.longitude },
    );
    return km <= matches.serviceRadiusKm;
  }

  return { findEligiblePros, isProEligible };
}

export type MatchingService = ReturnType<typeof createMatchingService>;

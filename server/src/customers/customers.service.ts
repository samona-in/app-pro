import {
  isCustomerProfileComplete,
  OnboardingStatus,
  type CustomerProfile,
  type Gender,
} from '@samona/types';
import type { CustomerOnboardingPatchInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';

export interface CustomersServiceDeps {
  prisma: PrismaClient;
}

/** Prisma row as it comes back from queries. */
const customerProfileSelect = {
  id: true,
  userId: true,
  onboardingStatus: true,
  displayName: true,
  gender: true,
  locationLabel: true,
  latitude: true,
  longitude: true,
  profile: { select: { avatarUrl: true } },
} as const;

type CustomerProfileRow = {
  profile: { avatarUrl: string | null };
} & Omit<CustomerProfile, 'avatarUrl'>;

function toCustomerProfile(row: CustomerProfileRow): CustomerProfile {
  const { profile, ...rest } = row;
  return {
    ...rest,
    avatarUrl: profile.avatarUrl,
  };
}

/**
 * Customers domain service.
 *
 * Owns the customer profile and its onboarding. Identity lives in `profiles`;
 * this is only the "who is this customer" layer.
 */
export function createCustomersService(deps: CustomersServiceDeps) {
  async function findByUserId(userId: string): Promise<CustomerProfile | null> {
    const row = await deps.prisma.customerProfile.findUnique({
      where: { userId },
      select: customerProfileSelect,
    });
    return row ? toCustomerProfile(row as CustomerProfileRow) : null;
  }

  /**
   * Returns the customer profile, creating an empty one on first access.
   *
   * `upsert` rather than create: a double-tapped "start onboarding" would
   * otherwise race and one request would fail the unique constraint on
   * `user_id`.
   */
  async function ensureForUser(userId: string): Promise<CustomerProfile> {
    const row = await deps.prisma.customerProfile.upsert({
      where: { userId },
      create: { userId, onboardingStatus: OnboardingStatus.NOT_STARTED },
      update: {},
      select: customerProfileSelect,
    });
    return toCustomerProfile(row as CustomerProfileRow);
  }

  /**
   * Applies one onboarding step.
   *
   * Steps save as the customer goes, so closing the app never loses answers
   * already given. Only the keys present are written; a step cannot blank
   * another's.
   *
   * `onboardingStatus` is derived from the resulting data rather than trusted
   * from the client.
   */
  async function applyOnboardingPatch(
    userId: string,
    patch: CustomerOnboardingPatchInput,
  ): Promise<CustomerProfile> {
    await ensureForUser(userId);

    const updated = await deps.prisma.$transaction(async (tx) => {
      await tx.customerProfile.update({
        where: { userId },
        data: {
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.gender !== undefined ? { gender: patch.gender as Gender } : {}),
          ...(patch.locationLabel !== undefined ? { locationLabel: patch.locationLabel } : {}),
          ...(patch.coordinates !== undefined
            ? { latitude: patch.coordinates.latitude, longitude: patch.coordinates.longitude }
            : {}),
        },
      });

      if (patch.avatarUrl !== undefined) {
        await tx.profile.update({
          where: { id: userId },
          data: { avatarUrl: patch.avatarUrl },
        });
      }

      const row = await tx.customerProfile.findUniqueOrThrow({
        where: { userId },
        select: customerProfileSelect,
      });
      return row;
    });

    return recomputeStatus(toCustomerProfile(updated as CustomerProfileRow));
  }

  /** Derives and persists onboarding status from the profile's own data. */
  async function recomputeStatus(profile: CustomerProfile): Promise<CustomerProfile> {
    const complete = isCustomerProfileComplete(profile);
    const hasAnyAnswer =
      Boolean(profile.displayName) || Boolean(profile.gender) || Boolean(profile.locationLabel);

    const status = complete
      ? OnboardingStatus.COMPLETED
      : hasAnyAnswer
        ? OnboardingStatus.IN_PROGRESS
        : OnboardingStatus.NOT_STARTED;

    if (status === profile.onboardingStatus) return profile;

    await deps.prisma.customerProfile.update({
      where: { id: profile.id },
      data: { onboardingStatus: status },
    });
    return { ...profile, onboardingStatus: status };
  }

  return { findByUserId, ensureForUser, applyOnboardingPatch };
}

export type CustomersService = ReturnType<typeof createCustomersService>;

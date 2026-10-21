import {
  isCustomerProfileComplete,
  OnboardingStatus,
  type CustomerProfile,
  type Gender,
} from '@samona/types';
import type { CustomerLocationPatchInput, CustomerOnboardingPatchInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import { unauthenticated, conflict } from '../common/errors';

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
  avatarUrl: true,
  locationLabel: true,
  locationPlaceId: true,
  latitude: true,
  longitude: true,
} as const;

type CustomerProfileRow = CustomerProfile;

function toCustomerProfile(row: CustomerProfileRow): CustomerProfile {
  return row;
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
   *
   * A finalized tombstone holds `userId = null` (see account deletion), so the
   * upsert's `where` finds nothing and the account re-registers as a *fresh*
   * customer under the same identity — the old row survives for referential
   * integrity (jobs, reviews and chat) but is never resolved again. A deletion
   * that is merely *in progress* (accepted, still awaiting active jobs) is
   * rejected outright: the identity must not mint a new surface while the old
   * one is being torn down. A still-linked tombstone (pre-migration rows) is
   * rejected as unauthenticated.
   */
  async function ensureForUser(userId: string): Promise<CustomerProfile> {
    const row = await deps.prisma.customerProfile.upsert({
      where: { userId },
      create: { userId, onboardingStatus: OnboardingStatus.NOT_STARTED },
      update: {},
      select: { ...customerProfileSelect, deletedAt: true, deletionRequestedAt: true },
    });
    if (row.deletedAt) throw unauthenticated('This account has been deleted.');
    if (row.deletionRequestedAt) {
      throw conflict(
        'Your customer account deletion is still being processed. Please try again later.',
      );
    }
    const { deletedAt: _deletedAt, deletionRequestedAt: _deletionRequestedAt, ...profile } = row;
    return toCustomerProfile(profile as CustomerProfileRow);
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
          ...(patch.locationPlaceId !== undefined
            ? { locationPlaceId: patch.locationPlaceId }
            : {}),
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
          ...(patch.coordinates !== undefined
            ? { latitude: patch.coordinates.latitude, longitude: patch.coordinates.longitude }
            : {}),
        },
      });

      const row = await tx.customerProfile.findUniqueOrThrow({
        where: { userId },
        select: customerProfileSelect,
      });
      return row;
    });

    return recomputeStatus(toCustomerProfile(updated as CustomerProfileRow));
  }

  /**
   * Records where the customer is right now.
   *
   * The app sends the device's own fix when it opens, so the customer's active
   * location is where they are rather than where they last tapped. A plain
   * coordinates write: it never touches onboarding status, and it leaves the
   * stored label and place id alone unless the client resolved new ones — a
   * reverse lookup that came back empty must not blank what is already there.
   */
  async function updateLocation(
    userId: string,
    input: CustomerLocationPatchInput,
  ): Promise<CustomerProfile> {
    await ensureForUser(userId);

    const updated = await deps.prisma.customerProfile.update({
      where: { userId },
      data: {
        latitude: input.coordinates.latitude,
        longitude: input.coordinates.longitude,
        ...(input.locationLabel !== undefined ? { locationLabel: input.locationLabel } : {}),
        ...(input.locationPlaceId !== undefined ? { locationPlaceId: input.locationPlaceId } : {}),
      },
      select: customerProfileSelect,
    });

    return toCustomerProfile(updated as CustomerProfileRow);
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

  return { findByUserId, ensureForUser, applyOnboardingPatch, updateLocation };
}

export type CustomersService = ReturnType<typeof createCustomersService>;

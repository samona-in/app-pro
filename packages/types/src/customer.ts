import type { OnboardingStatus } from './pro';
import type { Gender } from './user';

/** Customer onboarding steps, in order. */
export const CUSTOMER_ONBOARDING_STEPS = ['intro', 'name', 'gender', 'address', 'review'] as const;

export type CustomerOnboardingStep = (typeof CUSTOMER_ONBOARDING_STEPS)[number];

/** A customer profile as returned to the owning client. */
export interface CustomerProfile {
  id: string;
  userId: string;
  onboardingStatus: OnboardingStatus;
  displayName: string | null;
  gender: Gender | null;
  locationLabel: string | null;
  /** Durable place id for the label above, for re-resolving it on read. */
  locationPlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  avatarUrl: string | null;
}

/**
 * The one definition of "customer onboarding is done".
 */
export function isCustomerProfileComplete(
  profile: Pick<CustomerProfile, 'displayName' | 'gender'> | null,
): boolean {
  if (!profile) return false;

  return (
    typeof profile.displayName === 'string' &&
    profile.displayName.trim().length >= 2 &&
    profile.gender !== null
  );
}

/**
 * The first customer onboarding step still missing data.
 */
export function nextIncompleteCustomerStep(
  profile: CustomerProfile | null,
): CustomerOnboardingStep {
  if (!profile) return 'intro';
  if (!profile.displayName || profile.displayName.trim().length < 2) return 'name';
  if (!profile.gender) return 'gender';
  return 'review';
}

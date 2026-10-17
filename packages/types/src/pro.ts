import type { Gender } from './user';

/**
 * Professional profile and onboarding.
 *
 * Mirrors `OnboardingStatus` / `ExperienceLevel` / `Gender` in the Prisma
 * schema — keep these in sync.
 */
export const OnboardingStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type OnboardingStatus = (typeof OnboardingStatus)[keyof typeof OnboardingStatus];

export const ExperienceLevel = {
  UNDER_1_YEAR: 'UNDER_1_YEAR',
  ONE_TO_THREE: 'ONE_TO_THREE',
  THREE_TO_FIVE: 'THREE_TO_FIVE',
  FIVE_TO_TEN: 'FIVE_TO_TEN',
  TEN_PLUS: 'TEN_PLUS',
} as const;

export type ExperienceLevel = (typeof ExperienceLevel)[keyof typeof ExperienceLevel];

/**
 * How a pro's selected service is verified. Mirrors `ProServiceStatus` in the
 * Prisma schema — keep the two in sync.
 *
 * Newly selected services start `PENDING`; an admin flips them to `ACCEPTED` or
 * `REJECTED` (with a reason). The pro app only ever reads this.
 */
export const ProServiceStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;

export type ProServiceStatus = (typeof ProServiceStatus)[keyof typeof ProServiceStatus];

/** A service a pro selected, with its verification outcome. */
export interface ProServiceVerification {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  status: ProServiceStatus;
  rejectionReason: string | null;
}

/**
 * One row of the Manage Services screen: every active catalogue service with
 * the caller's verification status.
 *
 * `status` is null when the Pro has never requested the service — the screen
 * lists the whole catalogue so an unrequested service can be requested from
 * it, which is why this is not `ProServiceVerification`.
 */
export interface ProServiceListItem {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  status: ProServiceStatus | null;
  rejectionReason: string | null;
}

/**
 * What a submitted document proves. Mirrors `DocumentType` in the Prisma
 * schema — keep the two in sync.
 */
export const DocumentType = {
  ID_PROOF: 'ID_PROOF',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  PAYOUT_PROOF: 'PAYOUT_PROOF',
  TRADE_LICENCE: 'TRADE_LICENCE',
  CERTIFICATE: 'CERTIFICATE',
  OTHER: 'OTHER',
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/** Every document type, in the order the app groups them. */
export const DOCUMENT_TYPES = Object.values(DocumentType);

/**
 * A document's review outcome. Mirrors `DocumentStatus` in the Prisma schema —
 * keep the two in sync.
 *
 * Deliberately `APPROVED` rather than the `ACCEPTED` used by
 * `ProServiceStatus`: an "accepted document" reads wrong, and the two enums
 * never appear in the same expression.
 */
export const DocumentStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** Every document status, for filtering a caller's own lists. */
export const DOCUMENT_STATUSES = Object.values(DocumentStatus);

/**
 * A Pro's submitted document with its review outcome, as returned to the
 * owning client.
 *
 * The storage path is absent by construction: it is server-minted internal
 * state, and the bytes are reachable only through the authenticated
 * content-url endpoint — documents carry identity and bank details, so no
 * public read URL exists for them.
 */
export interface ProDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  /** The display name the Pro gave the file; never the storage key. */
  fileName: string;
  contentType: string;
  sizeBytes: number;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: ExperienceLevel.UNDER_1_YEAR, label: 'Less than 1 year' },
  { value: ExperienceLevel.ONE_TO_THREE, label: '1–3 years' },
  { value: ExperienceLevel.THREE_TO_FIVE, label: '3–5 years' },
  { value: ExperienceLevel.FIVE_TO_TEN, label: '5–10 years' },
  { value: ExperienceLevel.TEN_PLUS, label: '10+ years' },
];

export interface ServiceOption {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

export interface SkillOption {
  id: string;
  serviceId: string;
  slug: string;
  name: string;
}

/** A skill with its parent service, returned by catalogue search. */
export interface SkillWithService extends SkillOption {
  service: Pick<ServiceOption, 'id' | 'slug' | 'name' | 'icon'>;
}

/** Combined result for a catalogue search: matching services and skills. */
export interface ServiceSearchResult {
  services: ServiceOption[];
  skills: SkillWithService[];
}

/** A professional profile as returned to the owning client. */
export interface ProProfile {
  id: string;
  userId: string;
  onboardingStatus: OnboardingStatus;
  displayName: string | null;
  gender: Gender | null;
  bio: string | null;
  experienceLevel: ExperienceLevel | null;
  serviceRadiusKm: number;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  /** Durable place id for the label above, for re-resolving it on read. */
  locationPlaceId: string | null;
  languages: string[];
  /** Server-controlled; shown, never submitted. */
  isOnline: boolean;
  isVerified: boolean;
  rating: number | null;
  completedJobs: number;
  /**
   * True once a live-captured face photo has been uploaded. Part of the
   * onboarding gate: the API is the only writer.
   */
  hasSelfie: boolean;
  /** Read URL for the stored selfie; null until one exists. */
  selfiePhotoUrl: string | null;
  serviceIds: string[];
  skillIds: string[];
  /**
   * The pro's selected services with their verification status. `serviceIds`
   * above stays as the onboarding/matching source; this carries the display
   * metadata (name, icon) plus the admin-set verification outcome.
   */
  proServices: ProServiceVerification[];
}

/**
 * The one definition of "onboarding is done".
 *
 * Centralised deliberately: scattering these checks across screens is how a
 * Pro ends up stuck on a step the server thinks is finished, or admitted to the
 * app with an unusable profile. Both the API and the app import this, so they
 * cannot disagree.
 *
 * Documents are intentionally absent: they are collected after onboarding in
 * the profile's Documents section, reviewed by an admin, and never gate
 * completion — requiring them here would block a Pro who is otherwise ready
 * to work. The selfie is different: it is the one proof that the account
 * belongs to a real person, so it gates completion.
 */
export function isProProfileComplete(
  profile: Pick<
    ProProfile,
    | 'displayName'
    | 'gender'
    | 'experienceLevel'
    | 'serviceRadiusKm'
    | 'serviceIds'
    | 'skillIds'
    | 'hasSelfie'
  > | null,
): boolean {
  if (!profile) return false;

  return (
    typeof profile.displayName === 'string' &&
    profile.displayName.trim().length >= 2 &&
    profile.gender !== null &&
    profile.experienceLevel !== null &&
    profile.serviceRadiusKm > 0 &&
    profile.serviceIds.length > 0 &&
    profile.skillIds.length > 0 &&
    profile.hasSelfie
  );
}

/** The onboarding steps, in order. Drives both the UI and resume routing. */
export const ONBOARDING_STEPS = [
  'intro',
  'name',
  'gender',
  'services',
  'skills',
  'experience',
  'location',
  'radius',
  'about',
  'face',
  'review',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * The first step still missing data.
 *
 * This is what makes onboarding resumable: a Pro who closed the app after
 * choosing services returns to specialties, not to the beginning.
 */
export function nextIncompleteStep(profile: ProProfile | null): OnboardingStep {
  if (!profile) return 'intro';
  if (!profile.displayName || profile.displayName.trim().length < 2) return 'name';
  if (!profile.gender) return 'gender';
  if (profile.serviceIds.length === 0) return 'services';
  if (profile.skillIds.length === 0) return 'skills';
  if (!profile.experienceLevel) return 'experience';
  // Coordinates are optional, so the radius is the only persisted signal for
  // both work-area steps. Resuming at `location` keeps their natural order.
  if (!profile.serviceRadiusKm) return 'location';
  if (!profile.hasSelfie) return 'face';
  return 'review';
}

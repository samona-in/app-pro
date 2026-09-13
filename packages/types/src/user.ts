/**
 * The surfaces an account can operate on.
 *
 * One account per person can be both a customer and a professional (Rapido
 * style): which surface a request is on is chosen by the `X-App-Type` header —
 * the Pro app or the Customer app. Each surface has its own profile row; there
 * is no single stored role. Declared as a const object so the values survive
 * `isolatedModules` transpilation in Metro.
 */
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  PRO: 'PRO',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES = Object.values(UserRole);

/**
 * Gender identity, collected during onboarding.
 *
 * Deliberately small — male, female or other — and stored per requirement on
 * both the Pro and Customer profiles. Mirrors the `Gender` enum in the Prisma
 * schema; keep the two in sync.
 */
export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: Gender.MALE, label: 'Male' },
  { value: Gender.FEMALE, label: 'Female' },
  { value: Gender.OTHER, label: 'Other' },
];

/** A user as exposed to clients. Never includes credentials or internal fields. */
export interface PublicUser {
  id: string;
  /**
   * Which surface this session resolved to (PRO or CUSTOMER). Determined by the
   * `X-App-Type` header the client sent, not by a stored role.
   */
  role: UserRole;
  /** Stored privilege; never derived. */
  isAdmin: boolean;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  createdAt: string;
}

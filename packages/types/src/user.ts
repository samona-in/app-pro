/**
 * Roles recognised across every SAMONA surface.
 *
 * One authentication system serves Customer, Pro and Admin (CLAUDE.md
 * "Authentication"). This mirrors the `UserRole` enum in the Prisma schema —
 * keep the two in sync.
 *
 * Declared as a const object rather than a TS `enum` so the values survive
 * `isolatedModules` transpilation in Metro and are usable as both a value and
 * a type.
 */
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  PRO: 'PRO',
  ADMIN: 'ADMIN',
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
  role: UserRole;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

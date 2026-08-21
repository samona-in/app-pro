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

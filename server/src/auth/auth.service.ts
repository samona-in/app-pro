import { createClerkClient } from '@clerk/express';
import type { UserRole } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import { logger } from '../common/logger';

export interface AuthServiceDeps {
  prisma: PrismaClient;
  clerkSecretKey: string;
  /** Role given to a user provisioned on first sign-in. See config. */
  signupDefaultRole: UserRole;
}

/** The local user record, as the rest of the app consumes it. */
export interface LocalUser {
  id: string;
  clerkUserId: string;
  role: UserRole;
  phone: string | null;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

/**
 * Auth domain service.
 *
 * Clerk owns credentials and phone verification; this service owns the mapping
 * from a Clerk identity to our `User` row, which is the authority on `role`.
 *
 * Deliberately no sign-in, OTP or password logic: the application never sees a
 * credential, so there is nothing here to leak or to brute force.
 */
export function createAuthService(deps: AuthServiceDeps) {
  const clerk = createClerkClient({ secretKey: deps.clerkSecretKey });

  /** Picks the primary verified phone number, ignoring unverified ones. */
  function primaryPhone(user: {
    primaryPhoneNumberId: string | null;
    phoneNumbers: { id: string; phoneNumber: string; verification: { status: string } | null }[];
  }): string | null {
    const primary = user.phoneNumbers.find((p) => p.id === user.primaryPhoneNumberId);
    const candidate = primary ?? user.phoneNumbers[0];
    // An unverified number must never be trusted as an identity.
    if (!candidate || candidate.verification?.status !== 'verified') return null;
    return candidate.phoneNumber;
  }

  /**
   * Returns the local user for a verified Clerk id, creating it on first sign-in.
   *
   * Provisioning happens here rather than in a webhook so a brand-new user can
   * use the app immediately, without depending on webhook delivery. The webhook
   * keeps the row fresh afterwards.
   */
  async function syncUser(clerkUserId: string): Promise<LocalUser> {
    const existing = await deps.prisma.user.findUnique({ where: { clerkUserId } });
    if (existing) return existing as LocalUser;

    const clerkUser = await clerk.users.getUser(clerkUserId);
    const phone = primaryPhone(clerkUser);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;

    // upsert, not create: two concurrent first requests would otherwise race
    // and one would fail on the unique constraint.
    const user = await deps.prisma.user.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        role: deps.signupDefaultRole,
        phone,
        email,
        fullName,
        avatarUrl: clerkUser.imageUrl || null,
      },
      // Role is deliberately absent: provisioning must never change an
      // existing user's role.
      update: { phone, email, fullName, avatarUrl: clerkUser.imageUrl || null },
    });

    logger.info(`Provisioned local user ${user.id} for Clerk id ${clerkUserId}.`);
    return user as LocalUser;
  }

  /** Applies a `user.updated` webhook to the mirrored fields. */
  async function applyUserUpdated(input: {
    clerkUserId: string;
    phone: string | null;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  }): Promise<void> {
    await deps.prisma.user.updateMany({
      where: { clerkUserId: input.clerkUserId },
      data: {
        phone: input.phone,
        email: input.email,
        fullName: input.fullName,
        avatarUrl: input.avatarUrl,
      },
    });
  }

  /**
   * Applies a `user.deleted` webhook.
   *
   * Deactivates rather than deletes: jobs, payments and earnings reference this
   * row, and a hard delete would orphan financial history. Erasure requests are
   * a separate, deliberate process.
   */
  async function deactivateUser(clerkUserId: string): Promise<void> {
    await deps.prisma.user.updateMany({
      where: { clerkUserId },
      data: { isActive: false },
    });
    logger.info(`Deactivated local user for Clerk id ${clerkUserId}.`);
  }

  return { syncUser, applyUserUpdated, deactivateUser };
}

export type AuthService = ReturnType<typeof createAuthService>;

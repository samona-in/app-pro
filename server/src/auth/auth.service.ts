import type { UserRole } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import { logger } from '../common/logger';
import type { VerifiedToken } from './token';

export interface AuthServiceDeps {
  prisma: PrismaClient;
  /** Role given to a user provisioned on first sign-in. See config. */
  signupDefaultRole: UserRole;
}

/** The local user record, as the rest of the app consumes it. */
export interface LocalUser {
  id: string;
  role: UserRole;
  phone: string | null;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Auth domain service.
 *
 * Supabase Auth owns credentials and phone verification; this service owns the
 * mapping from a verified Supabase identity to our `User` row, which is the
 * authority on `role`.
 *
 * Deliberately no sign-in, OTP or password logic: the application never sees a
 * credential, so there is nothing here to leak or to brute force.
 */
export function createAuthService(deps: AuthServiceDeps) {
  /**
   * Returns the local user for a verified token, creating it on first sign-in.
   *
   * Everything needed to provision is already in the verified token, so this
   * costs one database round trip and never calls the Auth API.
   */
  async function syncUser(token: VerifiedToken): Promise<LocalUser> {
    const existing = await deps.prisma.profile.findUnique({ where: { id: token.userId } });

    if (existing) {
      // Keep the mirrored contact details fresh, but never touch `role`:
      // provisioning must not be able to change an existing user's privileges.
      const contactChanged = existing.phone !== token.phone || existing.email !== token.email;

      if (!contactChanged) return existing as LocalUser;

      const updated = await deps.prisma.profile.update({
        where: { id: token.userId },
        data: { phone: token.phone, email: token.email },
      });
      return updated as LocalUser;
    }

    // upsert, not create: two concurrent first requests would otherwise race
    // and one would fail on the primary key.
    const user = await deps.prisma.profile.upsert({
      where: { id: token.userId },
      create: {
        id: token.userId,
        role: deps.signupDefaultRole,
        phone: token.phone,
        email: token.email,
      },
      update: { phone: token.phone, email: token.email },
    });

    logger.info(`Provisioned local user ${user.id}.`);
    return user as LocalUser;
  }

  return { syncUser };
}

export type AuthService = ReturnType<typeof createAuthService>;

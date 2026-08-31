import type { UserRole } from '@samona/types';
import type { AppType } from '@samona/config';
import type { PrismaClient } from '../database/prisma';
import { logger } from '../common/logger';
import type { VerifiedToken } from './token';

export interface AuthServiceDeps {
  prisma: PrismaClient;
}

/** The local user record, as the rest of the app consumes it. */
export interface LocalUser {
  id: string;
  /** Stored privilege; never read from a token. */
  isAdmin: boolean;
  /** The surface this request is on, resolved from the `X-App-Type` header. */
  appType: AppType | null;
  phone: string | null;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * The `X-App-Type` header values the mobile clients send to say which surface
 * they operate on. Every account may be both a customer and a professional, so
 * this header selects the surface rather than granting a one-time role.
 */
const VALID_APP_TYPES = new Set<AppType>(['customer', 'pro']);

/** Normalises the header to a known surface, or null when absent/invalid. */
export function resolveAppType(header?: string): AppType | null {
  if (header && VALID_APP_TYPES.has(header as AppType)) return header as AppType;
  return null;
}

/**
 * Maps a surface to the `UserRole` a client is acting as.
 *
 * Used to shape the public user and route decisions. Not an authorization
 * control on its own: `isAdmin` and profile existence gate privileged routes.
 */
export function roleForAppType(appType: AppType | null): UserRole {
  return appType === 'customer' ? 'CUSTOMER' : 'PRO';
}

/**
 * Auth domain service.
 *
 * Supabase Auth owns credentials and phone verification; this service owns the
 * mapping from a verified Supabase identity to our `Profile` row.
 *
 * A person is both a customer and a professional by default; the surface they
 * operate on is chosen per-request by the app they are in (the `X-App-Type`
 * header). There is no single stored role to assign — `syncUser` only ensures
 * the identity row exists and mirrors contact details.
 *
 * Deliberately no sign-in, OTP or password logic: the application never sees a
 * credential, so there is nothing here to leak or to brute force.
 */
export function createAuthService(deps: AuthServiceDeps) {
  /**
   * Returns the local user for a verified token, creating the identity row on
   * first sign-in and mirroring contact details.
   *
   * Everything needed to provision is already in the verified token, so this
   * costs one database round trip and never calls the Auth API.
   */
  async function syncUser(token: VerifiedToken, appTypeHeader?: string): Promise<LocalUser> {
    const appType = resolveAppType(appTypeHeader);

    const existing = await deps.prisma.profile.findUnique({ where: { id: token.userId } });

    if (existing) {
      // Keep the mirrored contact details fresh, but never touch `isAdmin`:
      // provisioning must not be able to change an existing user's privileges.
      const contactChanged = existing.phone !== token.phone || existing.email !== token.email;

      const base = { ...toLocalUser(existing), appType };
      if (!contactChanged) return base;

      const updated = await deps.prisma.profile.update({
        where: { id: token.userId },
        data: { phone: token.phone, email: token.email },
      });
      return { ...toLocalUser(updated), appType };
    }

    // No local row for this Supabase id, but another row may own this phone.
    // That happens when the app re-installs or a fresh OTP yields a new Supabase
    // auth user id for the same phone. The phone is verified by Supabase, so it —
    // not the token id — is the authoritative identity: adopt the existing
    // account, re-keying it to the current id so its domain data (profile, jobs,
    // earnings) follows the phone instead of being orphaned or colliding on the
    // unique `phone` constraint.
    const owner = token.phone
      ? await deps.prisma.profile.findUnique({ where: { phone: token.phone } })
      : null;

    if (owner && owner.id !== token.userId) {
      // Re-keying cascades: pro_profiles/customer_profiles (and through them
      // jobs, earnings, ...) reference profiles.id with ON UPDATE CASCADE. A row
      // at token.userId cannot exist here or the earlier lookup would have hit it.
      const rekeyed = await deps.prisma.profile.update({
        where: { id: owner.id },
        data: { id: token.userId, phone: token.phone, email: token.email },
      });
      logger.info(`Adopted account ${owner.id} (phone) onto identity ${token.userId}.`);
      return { ...toLocalUser(rekeyed), appType };
    }

    // A new identity defaults to a plain user (isAdmin false) who can operate
    // on both surfaces. No role is stored; the surface is chosen per-request.
    const user = await deps.prisma.profile.upsert({
      where: { id: token.userId },
      create: {
        id: token.userId,
        phone: token.phone,
        email: token.email,
      },
      update: { phone: token.phone, email: token.email },
    });

    logger.info(`Provisioned local user ${user.id}.`);
    return toLocalUser(user);
  }

  function toLocalUser(row: {
    id: string;
    isAdmin: boolean;
    phone: string | null;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    createdAt: Date;
  }): LocalUser {
    return {
      id: row.id,
      isAdmin: row.isAdmin,
      phone: row.phone,
      email: row.email,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      isActive: row.isActive,
      createdAt: row.createdAt,
      appType: null,
    };
  }

  return { syncUser };
}

export type AuthService = ReturnType<typeof createAuthService>;

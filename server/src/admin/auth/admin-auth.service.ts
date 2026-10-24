import crypto from 'crypto';
import type { TokenVerifier } from '../../auth/token';

export interface AdminAuthServiceDeps {
  prisma: any;
  redis: any;
  /** Verifies Supabase access tokens — the same verifier the customer/pro APIs use. */
  verifier: TokenVerifier;
}

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Normalises a phone number to the digits-only form our `Profile.phone` uses.
 *
 * Supabase accepts (and echoes back) E.164 with a leading `+`; the database
 * stores the digits alone. Normalising at the boundary keeps lookups and the
 * rate-limit buckets consistent no matter which shape a caller sends.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function getIpKey(ip: string) {
  return `admin:login:ip:${ip}`;
}

function getPhoneKey(phone: string) {
  return `admin:login:phone:${phone}`;
}

function getDeviceKey(deviceId: string) {
  return `admin:login:device:${deviceId}`;
}

/**
 * Atomically counts one failure for a key and installs the lockout once the
 * threshold is reached.
 *
 * The whole read-modify-write runs as a single Lua script inside Redis, so two
 * API instances racing on the same key cannot both observe `count = 2` and
 * hand out a fourth attempt. Returns the lock expiry (ms epoch) when this
 * failure tripped the lock, otherwise null.
 */
const RECORD_FAILURE_SCRIPT = `
local lock = redis.call('GET', KEYS[1])
if lock then
  local lockedUntil = tonumber(lock)
  if lockedUntil and lockedUntil > tonumber(ARGV[2]) then
    return {0, lockedUntil}
  end
end
local count = redis.call('INCR', KEYS[2])
if count == 1 then
  redis.call('EXPIRE', KEYS[2], ARGV[1])
end
if count >= tonumber(ARGV[3]) then
  local lockedUntil = tonumber(ARGV[2]) + tonumber(ARGV[4])
  redis.call('SET', KEYS[1], tostring(lockedUntil), 'PX', ARGV[4])
  redis.call('DEL', KEYS[2])
  return {1, lockedUntil}
end
return {0, 0}
`;

interface LoginIdentity {
  phone: string;
  ip: string;
  deviceId?: string;
}

export function createAdminAuthService(deps: AdminAuthServiceDeps) {
  const prisma = deps.prisma;

  function keysFor({ phone, ip, deviceId }: LoginIdentity): string[] {
    const keys = [getIpKey(ip), getPhoneKey(phone)];
    if (deviceId) keys.push(getDeviceKey(deviceId));
    return keys;
  }

  function canUseRedis(): boolean {
    return Boolean(deps.redis) && typeof deps.redis.eval === 'function';
  }

  async function checkLoginAllowed(params: LoginIdentity) {
    if (!canUseRedis()) return { allowed: true as const };

    const now = Date.now();
    for (const key of keysFor(params)) {
      const lockedUntil = await deps.redis.get(key);
      if (!lockedUntil) continue;

      const lockedUntilMs = Number(lockedUntil);
      if (Number.isFinite(lockedUntilMs) && lockedUntilMs > now) {
        return {
          allowed: false as const,
          retryAfter: Math.ceil((lockedUntilMs - now) / 1000),
        };
      }

      // Expired lock (Redis TTL normally removes it) — drop it so the next
      // attempt starts from a clean counter.
      await deps.redis.del(key);
    }

    return { allowed: true as const };
  }

  /**
   * Records a failed login attempt against phone, IP and device.
   *
   * Returns the retry-after in seconds when this failure locked the identity
   * out, or null when attempts remain.
   */
  async function recordFailedAttempt(params: LoginIdentity): Promise<{ retryAfter: number } | null> {
    // No Redis: rate limiting is unavailable, but never fail the request.
    // Authentication still requires a valid Supabase token + admin record.
    if (!canUseRedis()) return null;

    const now = Date.now();
    let locked: number | null = null;

    for (const key of keysFor(params)) {
      const result = await deps.redis.eval(
        RECORD_FAILURE_SCRIPT,
        2,
        key,
        `${key}:count`,
        Math.ceil((24 * 60 * 60 * 1000) / 1000), // count TTL (seconds)
        now,
        MAX_FAILED_ATTEMPTS,
        LOCKOUT_DURATION_MS,
      );

      // ioredis returns the Lua table as an array: [locked(0|1), lockedUntilMs]
      if (Array.isArray(result) && Number(result[0]) === 1) {
        locked = Number(result[1]);
      }
    }

    if (locked === null) return null;
    return { retryAfter: Math.max(1, Math.ceil((locked - now) / 1000)) };
  }

  async function clearFailedAttempts(params: LoginIdentity) {
    if (!canUseRedis()) return;

    for (const key of keysFor(params)) {
      await deps.redis.del(key);
      await deps.redis.del(`${key}:count`);
    }
  }

  /**
   * Looks up the local admin record for a phone number.
   *
   * Admin privilege lives in our database on top of the Supabase identity:
   * a phone is only an admin when `AdminUser` exists and is active.
   */
  async function verifyAdminAccess(phone: string) {
    if (!prisma?.profile) return null;

    const digits = normalizePhone(phone);
    const profile = await prisma.profile.findFirst({
      where: {
        OR: [{ phone: digits }, { phone: `+${digits}` }],
      },
      include: { adminUser: true },
    });

    if (!profile) return null;
    if (!profile.adminUser || !profile.adminUser.isActive) return null;
    if (!profile.isActive || profile.deletedAt) return null;

    return profile;
  }

  /**
   * Verifies a Supabase access token and returns the matching admin profile.
   *
   * The token proves *identity* (the OTP was actually verified by Supabase).
   * Authorisation comes from the database: the token's `sub` must be the
   * profile id we provisioned as an admin. A token for any other user — even a
   * valid customer or pro — is not an admin.
   */
  async function verifyAdminToken(accessToken: string) {
    const verified = await deps.verifier.verify(accessToken);
    if (!verified) return null;

    const profile = await prisma.profile.findUnique({
      where: { id: verified.userId },
      include: { adminUser: true },
    });

    if (!profile) return null;
    if (!profile.adminUser || !profile.adminUser.isActive) return null;
    if (!profile.isActive || profile.deletedAt) return null;

    // The token's phone, when present, must agree with the profile. This stops
    // a token minted for one identity being paired with another admin row.
    if (verified.phone && normalizePhone(verified.phone) !== normalizePhone(profile.phone)) {
      return null;
    }

    return { profile, verified };
  }

  async function createSession(params: {
    adminUserId: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = await prisma.adminSession.create({
      data: {
        adminUserId: params.adminUserId,
        token,
        deviceId: params.deviceId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        expiresAt,
      },
    });

    return { token, session };
  }

  async function validateSession(token: string) {
    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: {
        adminUser: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt < new Date()) return null;
    if (!session.adminUser?.isActive) return null;
    if (!session.adminUser.profile?.isActive || session.adminUser.profile.deletedAt) return null;

    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return session;
  }

  async function revokeSession(token: string) {
    await prisma.adminSession.updateMany({
      where: { token },
      data: { revokedAt: new Date() },
    });
  }

  async function logLoginEvent(params: {
    phone: string;
    profileId?: string;
    ipAddress: string;
    deviceId?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    blocked?: boolean;
    blockedUntil?: Date;
  }) {
    if (!prisma?.adminLoginEvent) return;
    await prisma.adminLoginEvent.create({ data: params });
  }

  return {
    checkLoginAllowed,
    recordFailedAttempt,
    clearFailedAttempts,
    verifyAdminAccess,
    verifyAdminToken,
    createSession,
    validateSession,
    revokeSession,
    logLoginEvent,
  };
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>;

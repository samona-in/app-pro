import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../common/logger';

/**
 * Verifies Supabase Auth access tokens.
 *
 * Verification is local. Calling Supabase to validate every request would add a
 * network round trip to each authenticated call and make the API's availability
 * depend on the Auth service being reachable.
 *
 * Supabase signs tokens one of two ways, and a project can be on either:
 *  - asymmetric keys (ES256/RS256) published at a JWKS endpoint — the default
 *    for newer projects, and the only one that supports key rotation
 *  - a legacy shared HS256 secret
 *
 * Both are supported; the JWKS path is preferred when available.
 *
 * `jose` is pinned to v5: v6 is ESM-only and can be loaded from this CommonJS
 * server only through Node's newer `require(esm)` support, which is not
 * available across the whole Node range we declare. v5 ships a real CJS build.
 */

/** One authentication method a session used, from the JWT `amr` claim. */
export interface AuthMethod {
  /** RFC 8176-style method name, e.g. `otp`, `password`, `oauth`. */
  method: string;
  /** Unix seconds when that authentication happened, most recent first. */
  timestamp: number;
}

export interface VerifiedToken {
  /** Supabase `auth.users.id`. Our `User.id` matches it. */
  userId: string;
  phone: string | null;
  email: string | null;
  /**
   * How this session authenticated, most recent first. Empty when the token
   * carries no `amr` claim. Consumed by the account-deletion flow to prove the
   * pro re-authenticated with a fresh OTP (method `otp`) before a single-use
   * authorization is minted — identity and freshness come from here, never
   * from claims the client reports.
   */
  amr: AuthMethod[];
}

export interface TokenVerifierDeps {
  supabaseUrl: string;
  /** Explicit JWKS endpoint. Derived from `supabaseUrl` when omitted. */
  jwksUrl?: string | null;
  /** Legacy HS256 secret. Omit when the project uses asymmetric keys. */
  jwtSecret: string | null;
}

/** Reads a bearer token from the Authorization header. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

function claimString(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function createTokenVerifier(deps: TokenVerifierDeps) {
  const issuer = `${deps.supabaseUrl.replace(/\/+$/, '')}/auth/v1`;

  // jose caches the key set and refetches on rotation, so this is created once.
  const jwks = createRemoteJWKSet(new URL(deps.jwksUrl ?? `${issuer}/.well-known/jwks.json`));
  const hmacKey = deps.jwtSecret ? new TextEncoder().encode(deps.jwtSecret) : null;

  /**
   * Returns the verified identity, or null if the token is missing, malformed,
   * expired or not signed by this project.
   *
   * Never throws for an invalid token: an unauthenticated request is an
   * expected outcome, not an exceptional one.
   */
  async function verify(token: string): Promise<VerifiedToken | null> {
    // `authenticated` is the audience Supabase assigns to a signed-in user;
    // anon tokens carry `anon` and must not pass.
    const options = { issuer, audience: 'authenticated' } as const;

    try {
      const { payload } = await jwtVerify(token, jwks, options);
      return toVerified(payload);
    } catch (jwksError) {
      // Fall back to the legacy shared secret if the project uses one.
      if (hmacKey) {
        try {
          const { payload } = await jwtVerify(token, hmacKey, options);
          return toVerified(payload);
        } catch {
          return null;
        }
      }

      // No HS256 fallback configured: log once at debug so a misconfigured
      // JWKS URL is diagnosable without logging a line per failed request.
      logger.debug('Token verification failed and no HS256 secret is configured.', jwksError);
      return null;
    }
  }

  function toVerified(payload: JWTPayload): VerifiedToken | null {
    const userId = claimString(payload, 'sub');
    if (!userId) return null;

    return {
      userId,
      phone: claimString(payload, 'phone'),
      email: claimString(payload, 'email'),
      amr: parseAmr(payload.amr),
    };
  }

  /**
   * Reads the `amr` claim defensively. Issued tokens carry
   * `[{ method, timestamp }]`, most recent first; custom access-token hooks may
   * emit RFC 8176 bare strings instead, so entries that are not well-formed
   * objects are skipped rather than failing verification.
   */
  function parseAmr(value: unknown): AuthMethod[] {
    if (!Array.isArray(value)) return [];
    const methods: AuthMethod[] = [];
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { method, timestamp } = entry as Record<string, unknown>;
      if (typeof method !== 'string' || method.length === 0) continue;
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
      methods.push({ method, timestamp });
    }
    return methods;
  }

  return { verify };
}

export type TokenVerifier = ReturnType<typeof createTokenVerifier>;

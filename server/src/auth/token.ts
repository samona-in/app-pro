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

export interface VerifiedToken {
  /** Supabase `auth.users.id`. Our `User.id` matches it. */
  userId: string;
  phone: string | null;
  email: string | null;
}

export interface TokenVerifierDeps {
  supabaseUrl: string;
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
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
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
    };
  }

  return { verify };
}

export type TokenVerifier = ReturnType<typeof createTokenVerifier>;

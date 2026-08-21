import { SignJWT } from 'jose';
import { bearerToken, createTokenVerifier } from './token';

const SUPABASE_URL = 'https://project.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const SECRET = 'a-legacy-hs256-secret-long-enough-for-tests';
const key = new TextEncoder().encode(SECRET);

/** Mints a token the way Supabase Auth would, so the tests exercise real verification. */
async function mint(over: Record<string, unknown> = {}, signWith = key) {
  const {
    issuer = ISSUER,
    audience = 'authenticated',
    expiresIn = '1h',
    ...claims
  } = over as Record<string, string>;

  return new SignJWT({
    phone: '919876543210',
    email: '',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject((over.sub as string) ?? '11111111-2222-3333-4444-555555555555')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(signWith);
}

const verifier = createTokenVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: SECRET });

describe('bearerToken', () => {
  it('extracts a bearer token', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('rejects anything else', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
  });
});

describe('token verification', () => {
  it('accepts a valid token and returns the identity', async () => {
    const result = await verifier.verify(await mint());

    expect(result).toEqual({
      userId: '11111111-2222-3333-4444-555555555555',
      phone: '919876543210',
      email: null,
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const attackerKey = new TextEncoder().encode('a-completely-different-secret-value!!');

    expect(await verifier.verify(await mint({}, attackerKey))).toBeNull();
  });

  it('rejects an expired token', async () => {
    expect(await verifier.verify(await mint({ expiresIn: '-1h' }))).toBeNull();
  });

  it('rejects a token from another Supabase project', async () => {
    // Same algorithm, valid signature, wrong issuer.
    expect(
      await verifier.verify(await mint({ issuer: 'https://evil.supabase.co/auth/v1' })),
    ).toBeNull();
  });

  it('rejects an anon token', async () => {
    // The anon key is public; it must never authenticate a user.
    expect(await verifier.verify(await mint({ audience: 'anon' }))).toBeNull();
  });

  it('rejects a token with no subject', async () => {
    expect(await verifier.verify(await mint({ sub: '' }))).toBeNull();
  });

  it('rejects garbage without throwing', async () => {
    await expect(verifier.verify('not-a-token')).resolves.toBeNull();
    await expect(verifier.verify('')).resolves.toBeNull();
  });

  it('rejects everything when no HS256 secret is configured and JWKS is unreachable', async () => {
    const jwksOnly = createTokenVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: null });

    // Fails closed: an unverifiable token is never trusted.
    expect(await jwksOnly.verify(await mint())).toBeNull();
  });
});

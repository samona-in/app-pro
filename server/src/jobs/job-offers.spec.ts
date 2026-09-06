import { hashJobOfferToken, mintJobOffer, verifyJobOffer } from './job-offers';

const SECRET = 'a-secret-that-is-long-enough';
const NOW = new Date('2026-09-06T10:00:00.000Z');

describe('mintJobOffer / verifyJobOffer', () => {
  it('returns a token, its ledger hash and a sensible expiry', () => {
    const minted = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: SECRET,
      ttlMs: 90_000,
      now: NOW,
    });

    expect(minted.token).toContain('.');
    expect(minted.tokenHash).toHaveLength(64);
    expect(minted.expiresAt.getTime()).toBe(NOW.getTime() + 90_000);
    expect(hashJobOfferToken(minted.token)).toBe(minted.tokenHash);
  });

  it('verifies a token it minted and returns the minted claims', () => {
    const minted = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: SECRET,
      ttlMs: 90_000,
      now: NOW,
    });

    const offer = verifyJobOffer(minted.token, SECRET, NOW);

    expect(offer).toEqual({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      expiresAt: new Date(NOW.getTime() + 90_000),
    });
  });

  it('rejects a token signed with a different secret', () => {
    const minted = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: SECRET,
      ttlMs: 90_000,
      now: NOW,
    });

    expect(verifyJobOffer(minted.token, 'a-completely-different-secret', NOW)).toBeNull();
  });

  it('rejects a token after a single byte is tampered with', () => {
    const minted = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: SECRET,
      ttlMs: 90_000,
      now: NOW,
    });
    const flipped = minted.token.slice(0, -1) + (minted.token.endsWith('a') ? 'b' : 'a');

    expect(verifyJobOffer(flipped, SECRET, NOW)).toBeNull();
  });

  it('rejects an already-expired token', () => {
    const minted = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: SECRET,
      ttlMs: 90_000,
      now: NOW,
    });

    const later = new Date(NOW.getTime() + 90_001);
    expect(verifyJobOffer(minted.token, SECRET, later)).toBeNull();
  });

  it('rejects a token at the instant it expires (closed window)', () => {
    const minted = mintJobOffer({
      proId: 'pro-1',
      jobId: 'job-1',
      deviceId: 'device-1',
      secret: SECRET,
      ttlMs: 90_000,
      now: NOW,
    });
    const atExpiry = new Date(NOW.getTime() + 90_000);

    expect(verifyJobOffer(minted.token, SECRET, atExpiry)).toBeNull();
  });

  it('rejects malformed and empty tokens rather than throwing', () => {
    expect(verifyJobOffer('', SECRET, NOW)).toBeNull();
    expect(verifyJobOffer('no-dot', SECRET, NOW)).toBeNull();
    expect(verifyJobOffer('payload.', SECRET, NOW)).toBeNull();
    expect(verifyJobOffer(`payload.${'a'.repeat(200)}`, SECRET, NOW)).toBeNull();
    expect(verifyJobOffer('not-base64!!.not-base64!!', SECRET, NOW)).toBeNull();
  });
});
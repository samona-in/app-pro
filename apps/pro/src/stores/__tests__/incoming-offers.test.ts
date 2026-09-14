import { offerRemainingFraction, type PendingOffer } from '../incoming-offers';

function offer(partial: Partial<PendingOffer>): PendingOffer {
  return {
    jobId: 'job-1',
    title: 'Test job',
    serviceName: 'Plumbing',
    serviceCategory: 'Tap repair',
    address: '1 Main Road',
    distanceMeters: 800,
    amountPaise: 8800,
    expiresAt: null,
    offerExpiresAt: null,
    jobOfferToken: null,
    receivedAt: 1_000,
    ...partial,
  };
}

describe('offerRemainingFraction', () => {
  it('is full when newly received', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 1_000)).toBe(1);
  });

  it('is half way through the window', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 1_000 + 30_000)).toBeCloseTo(0.5);
  });

  it('is zero at the deadline', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 61_000)).toBe(0);
  });

  it('is zero past the deadline', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 200_000)).toBe(0);
  });

  it('clamps to one when the clock is behind the received time', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 500)).toBe(1);
  });

  it('is zero when the received time is already at the deadline', () => {
    const o = offer({ receivedAt: 61_000, offerExpiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 61_000)).toBe(0);
  });

  it('returns null without a deadline', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: null, expiresAt: null });
    expect(offerRemainingFraction(o, 2_000)).toBeNull();
  });

  it('falls back to the job expiry when there is no offer token window', () => {
    const o = offer({ receivedAt: 1_000, expiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 1_000 + 15_000)).toBeCloseTo(0.75);
  });
});

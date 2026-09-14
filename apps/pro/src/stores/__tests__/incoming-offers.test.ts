import {
  offerRemainingFraction,
  toPendingOfferFromAvailableJob,
  type PendingOffer,
} from '../incoming-offers';
import { JobStatus, type AvailableJob } from '@samona/types';

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

describe('toPendingOfferFromAvailableJob', () => {
  const job: AvailableJob = {
    id: 'job-1',
    customerId: 'cust-1',
    proId: null,
    service: { id: 'svc-1', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' },
    skill: { id: 'skill-1', slug: 'fan-installation', name: 'Fan installation' },
    customSkill: null,
    status: JobStatus.REQUESTED,
    placeType: 'RESIDENCE',
    placeDescription: null,
    locationLabel: '1 Main Road',
    latitude: 12.97,
    longitude: 77.6,
    description: 'Fix the switch near the door.',
    imageUrls: [],
    basePayPaise: 8800,
    agreedPayPaise: null,
    finalPayPaise: null,
    expiresAt: '2026-09-11T10:30:00.000Z',
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    distanceKm: 0.8,
    estimatedEtaMinutes: 2,
  };

  it('carries the server-sent job expiry into the offer', () => {
    const offer = toPendingOfferFromAvailableJob(job);
    expect(offer.expiresAt).toBe('2026-09-11T10:30:00.000Z');
    expect(offer.offerExpiresAt).toBeNull();
  });

  it('counts down against the job expiry window', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const offer = toPendingOfferFromAvailableJob({ ...job, expiresAt });
    const received = offer.receivedAt;
    const deadline = Date.parse(expiresAt);
    const now = received + (deadline - received) / 2;
    expect(offerRemainingFraction(offer, now)).toBeCloseTo(0.5);
  });
});

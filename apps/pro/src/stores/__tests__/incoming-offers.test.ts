import { JOB_DEFAULTS } from '@samona/config';
import { JobStatus, type AvailableJob } from '@samona/types';
import {
  offerDeadlineMs,
  offerRemainingFraction,
  toPendingOfferFromAvailableJob,
  toPendingOfferFromNative,
  toPendingOfferFromPushData,
  useIncomingOffersStore,
  type PendingOffer,
} from '../incoming-offers';
import type { PendingNativeJob } from '@/services/overlay-alert';

jest.mock('@/services/overlay-alert', () => ({
  getPendingNativeJobs: jest.fn(),
  clearNativeJobAlert: jest.fn(),
}));

import { getPendingNativeJobs } from '@/services/overlay-alert';

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

  it('is null without a deadline', () => {
    const o = offer({ receivedAt: 1_000, offerExpiresAt: null, expiresAt: null });
    expect(offerRemainingFraction(o, 2_000)).toBeNull();
  });

  it('does not treat the job-level expiry as an offer window', () => {
    const o = offer({ receivedAt: 1_000, expiresAt: '1970-01-01T00:01:01.000Z' });
    expect(offerRemainingFraction(o, 1_000 + 15_000)).toBeNull();
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

  it('carries no offer window — the store derives it from arrival time', () => {
    const offer = toPendingOfferFromAvailableJob(job);
    expect(offer.expiresAt).toBeNull();
    expect(offer.offerExpiresAt).toBeNull();
  });
});

describe('toPendingOfferFromPushData', () => {
  it('ignores the job-level push expiry for the offer window', () => {
    const offer = toPendingOfferFromPushData({
      jobId: 'job-1',
      expiresAt: '2026-09-11T10:30:00.000Z',
    });
    expect(offer?.expiresAt).toBeNull();
    expect(offer?.offerExpiresAt).toBeNull();
  });

  it('keeps a minted offer window when one is present', () => {
    const offer = toPendingOfferFromPushData({
      jobId: 'job-1',
      jobOfferToken: 'tok',
      offerExpiresAt: '2026-09-11T10:30:00.000Z',
    });
    expect(offer?.offerExpiresAt).toBe('2026-09-11T10:30:00.000Z');
  });
});

describe('toPendingOfferFromNative', () => {
  const native: PendingNativeJob = {
    jobId: 'job-1',
    title: 'Test job',
    serviceName: 'Plumbing',
    serviceCategory: null,
    address: null,
    distanceMeters: null,
    amountPaise: null,
    expiresAt: '2026-09-11T10:30:00.000Z',
    professionalId: null,
    jobOfferToken: null,
    offerExpiresAt: null,
    receivedAt: 1_000,
  };

  it('does not adopt the job-level native expiry as the offer window', () => {
    const offer = toPendingOfferFromNative(native);
    expect(offer.expiresAt).toBeNull();
    expect(offer.offerExpiresAt).toBeNull();
  });

  it('keeps a minted offer window from the native store', () => {
    const offer = toPendingOfferFromNative({
      ...native,
      jobOfferToken: 'tok',
      offerExpiresAt: '2026-09-11T10:30:00.000Z',
    });
    expect(offer.offerExpiresAt).toBe('2026-09-11T10:30:00.000Z');
    expect(offer.jobOfferToken).toBe('tok');
  });
});

describe('incoming offers store offer window', () => {
  function getOffer(jobId: string): PendingOffer {
    const stored = useIncomingOffersStore.getState().offersById[jobId];
    if (!stored) throw new Error(`Offer ${jobId} not in store`);
    return stored;
  }

  beforeEach(() => {
    useIncomingOffersStore.setState({ offersById: {}, now: Date.now() });
  });

  it('gives a newly arrived realtime offer the full default window from receipt', () => {
    const receivedAt = Date.now();
    useIncomingOffersStore.getState().upsert(offer({ receivedAt }));

    const stored = getOffer('job-1');
    expect(stored.receivedAt).toBe(receivedAt);
    expect(stored.offerExpiresAt).toBe(new Date(receivedAt + JOB_DEFAULTS.offerTtlMs).toISOString());
    expect(stored.expiresAt).toBeNull();
    expect(offerDeadlineMs(stored)).toBe(receivedAt + JOB_DEFAULTS.offerTtlMs);
    expect(offerRemainingFraction(stored, receivedAt)).toBe(1);
    expect(offerRemainingFraction(stored, receivedAt + 45_000)).toBeCloseTo(0.5);
    expect(offerRemainingFraction(stored, receivedAt + JOB_DEFAULTS.offerTtlMs)).toBe(0);
  });

  it('does not reset a running window on a duplicate event', () => {
    const firstReceived = Date.now();
    useIncomingOffersStore.getState().upsert(offer({ receivedAt: firstReceived }));
    const first = getOffer('job-1');

    useIncomingOffersStore.getState().upsert(offer({ receivedAt: firstReceived + 10_000 }));
    const after = getOffer('job-1');

    // The first arrival anchors the window; a re-delivered job cannot restart it.
    expect(after.receivedAt).toBe(firstReceived);
    expect(after.offerExpiresAt).toBe(first.offerExpiresAt);
  });

  it('keeps a minted offer window over the default', () => {
    const receivedAt = Date.now();
    const tokenExpires = new Date(receivedAt + 60_000).toISOString();
    useIncomingOffersStore
      .getState()
      .upsert(offer({ receivedAt, offerExpiresAt: tokenExpires, jobOfferToken: 'tok' }));

    const stored = getOffer('job-1');
    expect(stored.offerExpiresAt).toBe(tokenExpires);
    expect(stored.expiresAt).toBeNull();
    expect(offerDeadlineMs(stored)).toBe(Date.parse(tokenExpires));
  });

  it('never overwrites an existing offer window', () => {
    const receivedAt = Date.now();
    const deadline = new Date(receivedAt + 45_000).toISOString();
    useIncomingOffersStore.getState().upsert(offer({ receivedAt, offerExpiresAt: deadline }));

    const stored = getOffer('job-1');
    expect(stored.offerExpiresAt).toBe(deadline);
    expect(offerRemainingFraction(stored, receivedAt)).toBe(1);
  });

  it('keeps an offer whose window has not lapsed through a tick', () => {
    useIncomingOffersStore.getState().upsert(offer({ receivedAt: Date.now() }));
    useIncomingOffersStore.getState().tick();
    expect(() => getOffer('job-1')).not.toThrow();
  });

  it('prunes an offer once the derived window lapses', () => {
    useIncomingOffersStore.getState().upsert(offer({ receivedAt: Date.now() - 91_000 }));
    useIncomingOffersStore.getState().tick();
    expect(useIncomingOffersStore.getState().offersById['job-1']).toBeUndefined();
  });

  it('normalizes a token-less native offer to the default window, not the job expiry', async () => {
    const receivedAt = Date.now();
    (getPendingNativeJobs as jest.Mock).mockResolvedValue([
      {
        jobId: 'job-1',
        title: 'Test job',
        serviceName: 'Plumbing',
        serviceCategory: null,
        address: null,
        distanceMeters: null,
        amountPaise: null,
        expiresAt: new Date(receivedAt + 30 * 60_000).toISOString(),
        professionalId: null,
        jobOfferToken: null,
        offerExpiresAt: null,
        receivedAt,
      } satisfies PendingNativeJob,
    ]);

    await useIncomingOffersStore.getState().rehydrateFromNative();

    const stored = getOffer('job-1');
    expect(stored.expiresAt).toBeNull();
    expect(stored.offerExpiresAt).toBe(new Date(receivedAt + JOB_DEFAULTS.offerTtlMs).toISOString());
    expect(offerDeadlineMs(stored)).toBe(receivedAt + JOB_DEFAULTS.offerTtlMs);
  });
});

import { JobStatus, type JobDetail } from '@samona/types';
import { jobEarningPaise, summarizeTodayEarnings } from '../earnings';

const NOW = new Date('2026-10-30T12:00:00.000Z');

function job(overrides: Partial<JobDetail>): JobDetail {
  return {
    id: 'job',
    customerId: 'customer',
    proId: 'pro',
    service: { id: 'service', slug: 'plumbing', name: 'Plumbing', icon: '' },
    skill: { id: 'skill', slug: 'tap', name: 'Tap repair', icon: null },
    customSkill: null,
    status: JobStatus.PAID,
    locationLabel: null,
    latitude: null,
    longitude: null,
    description: 'Fix the tap',
    imageUrls: [],
    basePayPaise: 50_000,
    pricingModel: 'PER_BOOKING',
    unitPricePaise: 50_000,
    quantity: 1,
    unitLabel: null,
    durationMinutes: null,
    agreedPayPaise: null,
    finalPayPaise: null,
    expiresAt: null,
    createdAt: '2026-10-30T08:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    distanceKm: null,
    estimatedEtaMinutes: null,
    verificationOtp: null,
    customer: null,
    pro: null,
    acceptedAt: '2026-10-30T08:30:00.000Z',
    completedAt: '2026-10-30T10:00:00.000Z',
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  };
}

describe('jobEarningPaise', () => {
  it('prefers the final amount, then the agreed amount, then the base pay', () => {
    expect(jobEarningPaise({ finalPayPaise: 90_000, agreedPayPaise: 80_000, basePayPaise: 50_000 })).toBe(90_000);
    expect(jobEarningPaise({ finalPayPaise: null, agreedPayPaise: 80_000, basePayPaise: 50_000 })).toBe(80_000);
    expect(jobEarningPaise({ finalPayPaise: null, agreedPayPaise: null, basePayPaise: 50_000 })).toBe(50_000);
  });
});

describe('summarizeTodayEarnings', () => {
  it('returns an empty summary when there are no jobs', () => {
    expect(summarizeTodayEarnings([], NOW)).toEqual({
      completedJobs: 0,
      earningsPaise: 0,
      pendingPayoutPaise: 0,
      settledPaise: 0,
      hasEarnings: false,
    });
  });

  it('counts only jobs that finished today and ignores other statuses', () => {
    const jobs = [
      job({ id: 'yesterday', completedAt: '2026-10-29T10:00:00.000Z' }),
      job({ id: 'cancelled', status: JobStatus.CANCELLED, completedAt: '2026-10-30T10:00:00.000Z' }),
      job({ id: 'in-progress', status: JobStatus.IN_PROGRESS, completedAt: '2026-10-30T10:00:00.000Z' }),
      job({ id: 'today', status: JobStatus.PAID, finalPayPaise: 120_000 }),
    ];

    const summary = summarizeTodayEarnings(jobs, NOW);

    expect(summary.completedJobs).toBe(1);
    expect(summary.earningsPaise).toBe(120_000);
    expect(summary.settledPaise).toBe(120_000);
    expect(summary.pendingPayoutPaise).toBe(0);
  });

  it('splits settled and pending payouts from the same day', () => {
    const jobs = [
      job({ id: 'paid', status: JobStatus.PAID, finalPayPaise: 100_000 }),
      job({ id: 'completed', status: JobStatus.COMPLETED, agreedPayPaise: 60_000 }),
      job({ id: 'pending', status: JobStatus.PAYMENT_PENDING, basePayPaise: 40_000 }),
    ];

    const summary = summarizeTodayEarnings(jobs, NOW);

    expect(summary.completedJobs).toBe(3);
    expect(summary.earningsPaise).toBe(200_000);
    expect(summary.settledPaise).toBe(100_000);
    expect(summary.pendingPayoutPaise).toBe(100_000);
    expect(summary.hasEarnings).toBe(true);
  });

  it('treats a missing completion timestamp as not completed today', () => {
    const summary = summarizeTodayEarnings([job({ completedAt: null })], NOW);
    expect(summary.completedJobs).toBe(0);
  });
});

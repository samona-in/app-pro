import { JobStatus, type JobDetail } from '@samona/types';
import {
  ACTIVE_ORDER_STATUSES,
  activeJobStageIndex,
  isActiveOrder,
  jobStatusHint,
} from '../active-job-copy';

function makeJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'job-1',
    customerId: 'customer-1',
    proId: null,
    service: { id: 'svc-1', slug: 'plumbing', name: 'Plumbing', icon: null },
    skill: { id: 'skill-1', slug: 'other', name: 'Leak repair' },
    customSkill: null,
    status: JobStatus.REQUESTED,
    placeType: 'RESIDENCE',
    placeDescription: null,
    locationLabel: 'Benz Circle, Vijayawada',
    latitude: 16.51,
    longitude: 80.61,
    description: 'A leaking tap under the kitchen sink.',
    imageUrls: [],
    basePayPaise: 50000,
    agreedPayPaise: null,
    finalPayPaise: null,
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    distanceKm: null,
    estimatedEtaMinutes: null,
    verificationOtp: null,
    customer: null,
    pro: null,
    ...overrides,
  };
}

const pro = {
  proId: 'pro-1',
  displayName: 'Ravi Kumar',
  rating: 4.8,
  phone: '+919000000000',
};

describe('isActiveOrder', () => {
  it('treats request→payment-pending as active', () => {
    expect(ACTIVE_ORDER_STATUSES).toEqual([
      JobStatus.REQUESTED,
      JobStatus.OFFERED,
      JobStatus.ACCEPTED,
      JobStatus.TRAVELLING,
      JobStatus.ARRIVED,
      JobStatus.IN_PROGRESS,
      JobStatus.COMPLETED,
      JobStatus.PAYMENT_PENDING,
    ]);
    for (const status of ACTIVE_ORDER_STATUSES) {
      expect(isActiveOrder(status)).toBe(true);
    }
  });

  it('treats terminal statuses as inactive', () => {
    for (const status of [JobStatus.PAID, JobStatus.CANCELLED, JobStatus.EXPIRED]) {
      expect(isActiveOrder(status)).toBe(false);
    }
  });
});

describe('activeJobStageIndex', () => {
  it('maps each stage to a 0-based index', () => {
    expect(activeJobStageIndex(JobStatus.REQUESTED)).toBe(0);
    expect(activeJobStageIndex(JobStatus.ACCEPTED)).toBe(1);
    expect(activeJobStageIndex(JobStatus.TRAVELLING)).toBe(2);
    expect(activeJobStageIndex(JobStatus.ARRIVED)).toBe(3);
    expect(activeJobStageIndex(JobStatus.IN_PROGRESS)).toBe(4);
  });

  it('counts settlement statuses as fully progressed', () => {
    expect(activeJobStageIndex(JobStatus.COMPLETED)).toBe(5);
    expect(activeJobStageIndex(JobStatus.PAYMENT_PENDING)).toBe(5);
  });
});

describe('jobStatusHint', () => {
  it('says it is still finding a professional while unassigned', () => {
    const hint = jobStatusHint(makeJob({ status: JobStatus.REQUESTED }));
    expect(hint.title).toBe('Finding the best professional…');
    expect(hint.description).toBe("We've notified nearby pros. You'll be updated soon.");
    expect(hint.finding).toBe(true);
  });

  it('announces the assignment once accepted', () => {
    const hint = jobStatusHint(makeJob({ status: JobStatus.ACCEPTED, proId: pro.proId, pro }));
    expect(hint.title).toBe('Professional assigned');
    expect(hint.finding).toBe(false);
  });

  it('names the pro on the way and adds the ETA when the API provides it', () => {
    const withoutEta = jobStatusHint(
      makeJob({ status: JobStatus.TRAVELLING, proId: pro.proId, pro, estimatedEtaMinutes: null }),
    );
    expect(withoutEta.title).toBe('Ravi Kumar is on the way');
    expect(withoutEta.description).toBe('Heading to your location now.');

    const withEta = jobStatusHint(
      makeJob({ status: JobStatus.TRAVELLING, proId: pro.proId, pro, estimatedEtaMinutes: 12 }),
    );
    expect(withEta.title).toBe('Ravi Kumar is on the way · ~12 min');
  });

  it('falls back to a generic copy when the pro name is missing', () => {
    const hint = jobStatusHint(
      makeJob({
        status: JobStatus.TRAVELLING,
        proId: 'pro-1',
        pro: { ...pro, displayName: null },
      }),
    );
    expect(hint.title).toBe('Your professional is on the way');
  });

  it('covers arrival and in-progress states', () => {
    expect(jobStatusHint(makeJob({ status: JobStatus.ARRIVED })).title).toBe(
      'Your professional has arrived',
    );
    expect(jobStatusHint(makeJob({ status: JobStatus.IN_PROGRESS })).title).toBe(
      'Service in progress',
    );
  });

  it('groups completed and payment-pending under one settlement copy', () => {
    const completed = jobStatusHint(makeJob({ status: JobStatus.COMPLETED }));
    const pending = jobStatusHint(makeJob({ status: JobStatus.PAYMENT_PENDING }));
    expect(completed.title).toBe('Service completed');
    expect(completed.description).toBe('Payment settlement is in progress.');
    expect(pending.title).toBe(completed.title);
    expect(pending.description).toBe(completed.description);
  });
});
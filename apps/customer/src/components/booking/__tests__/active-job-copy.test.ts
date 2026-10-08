import { JobStatus, type JobDetail } from '@samona/types';
import {
  ACTIVE_ORDER_STATUSES,
  isActiveOrder,
  jobStatusHint,
  proDisplayName,
} from '../active-job-copy';

function makeJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'job-1',
    customerId: 'customer-1',
    proId: null,
    service: { id: 'svc-1', slug: 'electrician', name: 'Electrician', icon: null },
    skill: { id: 'skill-1', slug: 'other', name: 'Wiring' },
    customSkill: null,
    status: JobStatus.REQUESTED,
    placeType: 'RESIDENCE',
    placeDescription: null,
    locationLabel: 'Benz Circle, Vijayawada',
    latitude: 16.51,
    longitude: 80.61,
    description: 'A flickering light in the hall.',
    imageUrls: [],
    basePayPaise: 50000,
    agreedPayPaise: null,
    finalPayPaise: null,
    expiresAt: '2026-09-11T10:30:00.000Z',
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    distanceKm: null,
    estimatedEtaMinutes: null,
    verificationOtp: null,
    customer: null,
    pro: null,
    acceptedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  };
}

const pro = {
  proId: 'pro-1',
  displayName: 'Ravi Kumar',
  rating: 4.8,
  phone: '+919000000000',
  photoUrl: null,
  isDeleted: false,
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

describe('jobStatusHint', () => {
  it('shows the service and Searching while unassigned', () => {
    const hint = jobStatusHint(makeJob({ status: JobStatus.REQUESTED }));
    expect(hint.title).toBe('Electrician');
    expect(hint.stage).toBe('Searching');
    expect(hint.finding).toBe(true);

    expect(jobStatusHint(makeJob({ status: JobStatus.OFFERED })).finding).toBe(true);
  });

  it('shows pro name • service with the Started stage once accepted', () => {
    const hint = jobStatusHint(makeJob({ status: JobStatus.ACCEPTED, proId: pro.proId, pro }));
    expect(hint.title).toBe('Ravi Kumar • Electrician');
    expect(hint.stage).toBe('Started');
    expect(hint.finding).toBe(false);
  });

  it('assigns a short stage word for the journey states', () => {
    expect(
      jobStatusHint(makeJob({ status: JobStatus.TRAVELLING, proId: pro.proId, pro })).stage,
    ).toBe('Arriving');
    expect(jobStatusHint(makeJob({ status: JobStatus.ARRIVED, proId: pro.proId, pro })).stage).toBe(
      'Arrived',
    );
    expect(
      jobStatusHint(makeJob({ status: JobStatus.IN_PROGRESS, proId: pro.proId, pro })).stage,
    ).toBe('Work in progress');
  });

  it('groups settlement statuses under Payment pending', () => {
    expect(
      jobStatusHint(makeJob({ status: JobStatus.COMPLETED, proId: pro.proId, pro })).stage,
    ).toBe('Payment pending');
    expect(
      jobStatusHint(makeJob({ status: JobStatus.PAYMENT_PENDING, proId: pro.proId, pro })).stage,
    ).toBe('Payment pending');
  });

  it('falls back to a generic pro label when the name is missing', () => {
    const hint = jobStatusHint(
      makeJob({
        status: JobStatus.TRAVELLING,
        proId: 'pro-1',
        pro: { ...pro, displayName: null },
      }),
    );
    expect(hint.title).toBe('Professional • Electrician');
  });

  it('labels a deleted professional neutrally', () => {
    expect(proDisplayName(pro)).toBe('Ravi Kumar');
    expect(proDisplayName(null)).toBe('Deleted Professional');
    expect(proDisplayName({ ...pro, displayName: null })).toBe('Professional');
    expect(proDisplayName({ ...pro, isDeleted: true })).toBe('Deleted Professional');
    expect(proDisplayName({ ...pro, displayName: null, isDeleted: true })).toBe(
      'Deleted Professional',
    );

    const hint = jobStatusHint(
      makeJob({
        status: JobStatus.TRAVELLING,
        proId: pro.proId,
        pro: { ...pro, displayName: null, isDeleted: true },
      }),
    );
    expect(hint.title).toBe('Deleted Professional • Electrician');
  });
});

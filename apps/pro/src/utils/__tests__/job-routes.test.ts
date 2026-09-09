import { JobStatus } from '@samona/types';
import { occupiedJobRoute } from '../job-routes';

const job = (id: string, status: JobStatus) => ({ id, status });

describe('occupiedJobRoute', () => {
  it('returns null when nothing needs the pro off home', () => {
    expect(occupiedJobRoute([])).toBeNull();
    expect(occupiedJobRoute([job('a', JobStatus.REQUESTED)])).toBeNull();
  });

  it('prefers an unpaid settlement over an active job', () => {
    const jobs = [job('active', JobStatus.ACCEPTED), job('unpaid', JobStatus.COMPLETED)];
    expect(occupiedJobRoute(jobs)).toBe('/job/unpaid/pay');
  });

  it('routes a completed or payment-pending job to its pay screen', () => {
    expect(occupiedJobRoute([job('a', JobStatus.COMPLETED)])).toBe('/job/a/pay');
    expect(occupiedJobRoute([job('b', JobStatus.PAYMENT_PENDING)])).toBe('/job/b/pay');
  });

  it('routes an in-flight job to its active screen', () => {
    const statuses = [
      JobStatus.ACCEPTED,
      JobStatus.TRAVELLING,
      JobStatus.ARRIVED,
      JobStatus.IN_PROGRESS,
    ];
    for (const status of statuses) {
      expect(occupiedJobRoute([job('a', status)])).toBe('/job/a/active');
    }
  });

  it('ignores terminal jobs when nothing else is open', () => {
    const jobs = [job('a', JobStatus.PAID), job('b', JobStatus.CANCELLED)];
    expect(occupiedJobRoute(jobs)).toBeNull();
  });
});

import { JobStatus, type JobDetail } from '@samona/types';

/**
 * What a completed job actually paid the pro.
 *
 * The server snapshots the negotiated amount on acceptance (`agreedPayPaise`)
 * and the final amount on completion (`finalPayPaise`); `basePayPaise` is the
 * guaranteed fallback for older rows. This mirrors how the job screens read
 * pay, so Home can never disagree with the job it summarises.
 */
export function jobEarningPaise(job: Pick<JobDetail, 'finalPayPaise' | 'agreedPayPaise' | 'basePayPaise'>) {
  return job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise ?? 0;
}

/** A job whose work is done and which therefore counts as completed today. */
const COMPLETED_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
  JobStatus.PAID,
]);

/**
 * True when the two instants fall on the same local calendar day.
 *
 * Local — not UTC — because "today's earnings" is what the pro sees on their
 * own clock. An invalid timestamp is never "today".
 */
export function isSameLocalDay(value: string | Date | null | undefined, now: Date): boolean {
  if (value === null || value === undefined) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export interface TodayEarningsSummary {
  /** Completed jobs whose work finished today. */
  completedJobs: number;
  /** Everything earned from those jobs, settled or not, in paise. */
  earningsPaise: number;
  /** The part of `earningsPaise` that has not landed as PAID yet. */
  pendingPayoutPaise: number;
  /** The part of `earningsPaise` already settled (PAID). */
  settledPaise: number;
  /** False when there is nothing to show for today yet. */
  hasEarnings: boolean;
}

export const EMPTY_TODAY_EARNINGS: TodayEarningsSummary = {
  completedJobs: 0,
  earningsPaise: 0,
  pendingPayoutPaise: 0,
  settledPaise: 0,
  hasEarnings: false,
};

/**
 * Rolls the pro's own jobs up into the Home dashboard's "today" figures.
 *
 * This is the real earnings source until a dedicated earnings endpoint ships:
 * `GET /jobs/mine` already carries `completedAt` and the pay fields, and the
 * server is the only writer of both. A job counts only when its work actually
 * completed today and it is not cancelled/expired, so an old job updated today
 * cannot leak into today's total.
 */
export function summarizeTodayEarnings(
  jobs: readonly JobDetail[],
  now: Date = new Date(),
): TodayEarningsSummary {
  let completedJobs = 0;
  let earningsPaise = 0;
  let pendingPayoutPaise = 0;
  let settledPaise = 0;

  for (const job of jobs) {
    if (!COMPLETED_STATUSES.has(job.status)) continue;
    if (!isSameLocalDay(job.completedAt, now)) continue;

    const amount = jobEarningPaise(job);
    completedJobs += 1;
    earningsPaise += amount;
    if (job.status === JobStatus.PAID) settledPaise += amount;
    else pendingPayoutPaise += amount;
  }

  return {
    completedJobs,
    earningsPaise,
    pendingPayoutPaise,
    settledPaise,
    hasEarnings: completedJobs > 0,
  };
}

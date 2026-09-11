import { JobStatus, type JobDetail } from '@samona/types';

/**
 * Statuses that keep a customer's order "live", from request through cash
 * settlement. `PAID`, `CANCELLED` and `EXPIRED` are terminal and never occupy
 * the active-job hint.
 */
export const ACTIVE_ORDER_STATUSES: readonly JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.OFFERED,
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
] as const;

export function isActiveOrder(status: JobStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly JobStatus[]).includes(status);
}

export interface JobHintCopy {
  /** Primary line: "Ravi Kumar • Electrician", or the service while searching. */
  title: string;
  /** One/two-word stage, e.g. Arriving, Work in progress. */
  stage: string;
  /** Matching is still running — show the small animated indicator. */
  finding: boolean;
}

export const JOB_STAGE_WORD: Record<JobStatus, string> = {
  [JobStatus.REQUESTED]: 'Searching',
  [JobStatus.OFFERED]: 'Searching',
  [JobStatus.ACCEPTED]: 'Started',
  [JobStatus.TRAVELLING]: 'Arriving',
  [JobStatus.ARRIVED]: 'Arrived',
  [JobStatus.IN_PROGRESS]: 'Work in progress',
  [JobStatus.COMPLETED]: 'Payment pending',
  [JobStatus.PAYMENT_PENDING]: 'Payment pending',
  [JobStatus.PAID]: 'Completed',
  [JobStatus.CANCELLED]: 'Cancelled',
  [JobStatus.EXPIRED]: 'Expired',
};

/**
 * The wording of the active-job hint for a given status.
 *
 * This is the single place the hint copy lives, kept deliberately tiny and
 * pure so the mapping is unit-testable without mounting the sheet.
 */
export function jobStatusHint(job: JobDetail): JobHintCopy {
  const searching = job.status === JobStatus.REQUESTED || job.status === JobStatus.OFFERED;

  if (searching) {
    return {
      title: job.service.name,
      stage: 'Searching',
      finding: true,
    };
  }

  const proName = job.pro?.displayName ?? 'Professional';
  return {
    title: `${proName} • ${job.service.name}`,
    stage: JOB_STAGE_WORD[job.status],
    finding: false,
  };
}
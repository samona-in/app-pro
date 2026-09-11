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

/** The states in the order the customer experiences them, for the progress row. */
export const ACTIVE_JOB_STAGES: readonly JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
] as const;

/**
 * 0-based index into `ACTIVE_JOB_STAGES`. Anything past in-progress
 * (completed / payment pending) counts as fully progressed.
 */
export function activeJobStageIndex(status: JobStatus): number {
  const stage = ACTIVE_JOB_STAGES.indexOf(status);
  return stage === -1 ? ACTIVE_JOB_STAGES.length : stage;
}

export interface JobHintCopy {
  /** Compact one-line status copy for the collapsed hint. */
  subtitle: string;
  /** Matching is still running — show the small animated indicator. */
  finding: boolean;
  /** The current stage label for the expanded progress row. */
  stageLabel: string;
}

/**
 * The wording of the active-job hint for a given status.
 *
 * This is the single place the hint copy lives, kept deliberately tiny and
 * pure so the mapping is unit-testable without mounting the sheet.
 */
export function jobStatusHint(job: JobDetail): JobHintCopy {
  const proName = job.pro?.displayName ?? null;

  switch (job.status) {
    case JobStatus.REQUESTED:
    case JobStatus.OFFERED:
      return {
        subtitle: 'Finding a professional…',
        finding: true,
        stageLabel: 'Request sent',
      };

    case JobStatus.ACCEPTED:
      return {
        subtitle: 'Professional assigned',
        finding: false,
        stageLabel: 'Professional assigned',
      };

    case JobStatus.TRAVELLING: {
      const base = proName ? `${proName} is on the way` : 'Professional is on the way';
      const eta = job.estimatedEtaMinutes;
      return {
        subtitle: eta !== null ? `${base} · ~${eta} min` : base,
        finding: false,
        stageLabel: 'On the way',
      };
    }

    case JobStatus.ARRIVED:
      return {
        subtitle: 'Professional has arrived',
        finding: false,
        stageLabel: 'Arrived',
      };

    case JobStatus.IN_PROGRESS:
      return {
        subtitle: 'Service in progress',
        finding: false,
        stageLabel: 'In progress',
      };

    case JobStatus.COMPLETED:
    case JobStatus.PAYMENT_PENDING:
      return {
        subtitle: 'Service completed • Payment pending',
        finding: false,
        stageLabel: 'Payment pending',
      };

    default:
      return {
        subtitle: 'Service active',
        finding: false,
        stageLabel: 'Active',
      };
  }
}
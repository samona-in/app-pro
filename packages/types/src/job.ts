/**
 * The job lifecycle (CLAUDE.md "Job State Machine").
 *
 * The backend is the only component allowed to move a job between states, and
 * it must validate every transition against `JOB_STATUS_TRANSITIONS`. Clients
 * request transitions; they never assert them.
 */
export const JobStatus = {
  REQUESTED: 'REQUESTED',
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  TRAVELLING: 'TRAVELLING',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JOB_STATUSES = Object.values(JobStatus);

/**
 * Allowed forward transitions. An empty list marks a terminal state.
 *
 * This table is the shared contract: the server enforces it, and the Pro app
 * uses it to decide which action to surface. It intentionally describes only
 * the shape of the machine — the authorisation rules for *who* may trigger a
 * transition live in the server's jobs domain.
 */
export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  REQUESTED: [JobStatus.OFFERED, JobStatus.CANCELLED, JobStatus.EXPIRED],
  OFFERED: [JobStatus.ACCEPTED, JobStatus.REQUESTED, JobStatus.CANCELLED, JobStatus.EXPIRED],
  ACCEPTED: [JobStatus.TRAVELLING, JobStatus.CANCELLED],
  TRAVELLING: [JobStatus.ARRIVED, JobStatus.CANCELLED],
  ARRIVED: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  IN_PROGRESS: [JobStatus.COMPLETED, JobStatus.CANCELLED],
  COMPLETED: [JobStatus.PAYMENT_PENDING],
  PAYMENT_PENDING: [JobStatus.PAID, JobStatus.CANCELLED],
  PAID: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[status].length === 0;
}

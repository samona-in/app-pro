import type { ServiceOption, SkillOption } from './pro';

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

/**
 * Where the customer needs the work done.
 *
 * Mirrors `PlaceType` in the Prisma schema. OTHER records a free-text
 * `placeDescription` on the job instead of choosing a bucket.
 */
export const PlaceType = {
  RESIDENCE: 'RESIDENCE',
  OFFICE: 'OFFICE',
  OTHER: 'OTHER',
} as const;

export type PlaceType = (typeof PlaceType)[keyof typeof PlaceType];

/** Display choices for the booking flow's "where" step, in order. */
export const PLACE_TYPES: { value: PlaceType; label: string; icon: string }[] = [
  { value: PlaceType.RESIDENCE, label: 'Residence', icon: 'home-outline' },
  { value: PlaceType.OFFICE, label: 'Office', icon: 'business-outline' },
  { value: PlaceType.OTHER, label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

/** Maximum reference photos a customer may attach to a job request. */
export const JOB_IMAGE_LIMIT = 5;

/** Minimum length of the free-text job description, shared with validation. */
export const JOB_DESCRIPTION_MIN = 10;

/**
 * A job request as returned to its owner — the customer who placed it.
 *
 * `service` and `skill` are embedded so a client renders a booking without a
 * second lookup. Image paths are never exposed; only public URLs are.
 */
export interface Job {
  id: string;
  customerId: string;
  /** The accepting professional's ProProfile id; null until accepted. */
  proId: string | null;
  service: Pick<ServiceOption, 'id' | 'slug' | 'name' | 'icon'>;
  skill: Pick<SkillOption, 'id' | 'slug' | 'name'>;
  status: JobStatus;
  placeType: PlaceType;
  placeDescription: string | null;
  description: string;
  imageUrls: string[];
  /** Guaranteed amount, in paise. */
  basePayPaise: number;
  agreedPayPaise: number | null;
  finalPayPaise: number | null;
  createdAt: string;
  updatedAt: string;
}

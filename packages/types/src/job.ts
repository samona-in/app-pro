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
 *
 * `REQUESTED` as a target from ACCEPTED/TRAVELLING/ARRIVED is the **pro
 * release** path: an assigned pro hands the job back to the open pool so other
 * eligible pros can take it. The server alone decides between release
 * (pro-actor → REQUESTED) and cancellation (customer-actor → CANCELLED);
 * clients never pick the target.
 */
export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  REQUESTED: [JobStatus.OFFERED, JobStatus.CANCELLED, JobStatus.EXPIRED],
  OFFERED: [JobStatus.ACCEPTED, JobStatus.REQUESTED, JobStatus.CANCELLED, JobStatus.EXPIRED],
  ACCEPTED: [JobStatus.TRAVELLING, JobStatus.REQUESTED, JobStatus.CANCELLED],
  TRAVELLING: [JobStatus.ARRIVED, JobStatus.REQUESTED, JobStatus.CANCELLED],
  ARRIVED: [JobStatus.IN_PROGRESS, JobStatus.REQUESTED, JobStatus.CANCELLED],
  // Once the pro has started the work there is no turning back: a pro may only
  // hand the job back up to and including ARRIVED, when they have seen the job
  // and can still let it go, and that is exactly what the REQUESTED target
  // permits. From IN_PROGRESS the job must run to completion and collection.
  IN_PROGRESS: [JobStatus.COMPLETED],
  COMPLETED: [JobStatus.PAYMENT_PENDING],
  PAYMENT_PENDING: [JobStatus.PAID],
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
 * Statuses where the job conversation is closed: the work is settled (PAID) or
 * over before it finished (CANCELLED, EXPIRED). New messages are rejected by
 * the server and chat entry points are hidden, but the thread stays readable.
 */
export const CHAT_CLOSED_STATUSES: readonly JobStatus[] = [
  JobStatus.PAID,
  JobStatus.CANCELLED,
  JobStatus.EXPIRED,
];

export function isChatClosed(status: JobStatus): boolean {
  return (CHAT_CLOSED_STATUSES as readonly JobStatus[]).includes(status);
}

/** Maximum reference photos a customer may attach to a job request. */
export const JOB_IMAGE_LIMIT = 5;

/** Minimum length of the free-text job description, shared with validation. */
export const JOB_DESCRIPTION_MIN = 10;

/**
 * The service-level sentinel skill for "Other".
 *
 * Every service carries a skill row with this slug so the customer can type a
 * custom category (`Job.customSkill`) while the job still references a real
 * skill through its foreign key.
 */
export const OTHER_SKILL_SLUG = 'other';

/** Minimum length of the free-text "Other" category. */
export const JOB_CUSTOM_SKILL_MIN = 3;

/** Maximum length of the free-text "Other" category. */
export const JOB_CUSTOM_SKILL_MAX = 60;

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
  /** The free-text category when `skill.slug` is `other`; null otherwise. */
  customSkill: string | null;
  status: JobStatus;
  /** Display label for the work location, snapshotted at creation. */
  locationLabel: string | null;
  /** Work-location coordinates, snapshotted at creation. Null until known. */
  latitude: number | null;
  longitude: number | null;
  description: string;
  imageUrls: string[];
  /** Guaranteed amount, in paise. */
  basePayPaise: number;
  agreedPayPaise: number | null;
  finalPayPaise: number | null;
  /** When the request stops being actionable (ISO). Null until known. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A status an assigned pro is actively working right now. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
] as const;

export function isActiveJobStatus(status: JobStatus): boolean {
  return (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/**
 * A job the pro worked and handed back but that has not been paid yet —
 * COMPLETED (work done, cash not yet collected) or PAYMENT_PENDING (awaiting
 * confirmation). A job in either state is not truly finished for the pro: the
 * availability home must not host them, and the app pulls them back to the
 * cash-settlement screen until the money is in.
 */
export const SETTLEMENT_PENDING_STATUSES: readonly JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
] as const;

export function isSettlementPendingStatus(status: JobStatus): boolean {
  return (SETTLEMENT_PENDING_STATUSES as readonly JobStatus[]).includes(status);
}

/**
 * Customer context shared with the assigned pro.
 *
 * Hidden from a pro until the job is accepted: the pro meets the customer only
 * once they are committed to the work.
 */
export interface JobCustomerSummary {
  /**
   * The customer's identity id. Null when the customer surface has been
   * deleted: its tombstone is unlinked from the identity (see account
   * deletion), so there is nobody to reach or authorise against. Render the
   * neutral "Deleted Customer" placeholder, mirroring the pro side.
   */
  userId: string | null;
  displayName: string | null;
  locationLabel: string | null;
  /** Contact number, shared once the job is accepted so the pro can call. */
  phone: string | null;
}

/**
 * A job plus the fields one side needs to act on it.
 *
 * `Job` (the deployed shape) is always the payload; the optional extras are
 * filled in per reader — distance/ETA for the pro's available jobs, the
 * counterparty's identity for detail reads.
 */
export interface JobDetail extends Job {
  /** Straight-line distance from the viewing pro, km. Null unless filled. */
  distanceKm: number | null;
  /** Derived travel time from the viewing pro, minutes. Null unless filled. */
  estimatedEtaMinutes: number | null;
  /**
   * The one-time start-work code. Present **only** in the customer's read, once
   * it has been issued (after the pro swipes Start Work). Always null for the
   * pro view — the pro must ask the customer for it, never read it from the API.
   */
  verificationOtp: string | null;
  /** The customer who placed the job; shared with the pro once assigned. */
  customer: JobCustomerSummary | null;
  /** The assigned professional, shared back to the customer. */
  pro: {
    proId: string;
    displayName: string | null;
    rating: number | null;
    /** Contact number, shared once the job is accepted so the customer can call. */
    phone: string | null;
    /** The pro's profile photo (their verified selfie), when one exists. */
    photoUrl: string | null;
    /**
     * Whether the assigned professional has deleted their account. Their PII
     * (name, photo, phone) has been stripped; render a neutral placeholder.
     */
    isDeleted: boolean;
  } | null;
  /** When the professional accepted the job; null until accepted. */
  acceptedAt: string | null;
  /** When the work was completed; null until it reaches a completed state. */
  completedAt: string | null;
  /**
   * When the job was cancelled; null until it leaves the flow via a
   * cancellation. The client uses this (with `cancelledBy`) to tell a
   * customer-initiated cancellation of an active job apart from any other
   * terminal outcome.
   */
  cancelledAt: string | null;
  /**
   * Who cancelled: the customer or the assigned pro. Null until the job is
   * cancelled. Derived from the actor on the status transition, never from a
   * client claim.
   */
  cancelledBy: 'customer' | 'pro' | null;
}

/**
 * An open, unassigned job in the pro's available-jobs pool.
 *
 * A `REQUESTED` job with no `proId` yet, surfaced to every eligible pro. The
 * first eligible pro to accept takes it atomically.
 */
export interface AvailableJob extends Job {
  /** Straight-line distance from the viewing pro, km. Null if no location. */
  distanceKm: number | null;
  /** Derived travel time, minutes. Null if no location. */
  estimatedEtaMinutes: number | null;
}

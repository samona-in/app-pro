/**
 * Account-deletion DTOs, consumed by the Pro and Customer apps.
 *
 * The `AccountDeletionScope`/`AccountDeletionStatus` member names mirror the
 * Prisma enums `AccountDeletionScope`/`AccountDeletionStatus` in the server
 * schema — keep the two in sync. The server is the authority on scope (decided
 * from the account shape and the caller's surface, never from the client);
 * these types only describe what the server returns.
 */

export const AccountDeletionScope = {
  /** Only the professional surface is removed; the customer surface and Signin persist. */
  PRO_PROFILE: 'PRO_PROFILE',
  /** Only the customer surface is removed; the pro surface and Signin persist. */
  CUSTOMER_PROFILE: 'CUSTOMER_PROFILE',
  /** The whole identity is torn down, including Supabase Auth. */
  FULL_ACCOUNT: 'FULL_ACCOUNT',
} as const;

export type AccountDeletionScope = (typeof AccountDeletionScope)[keyof typeof AccountDeletionScope];

export const AccountDeletionStatus = {
  /** A fresh OTP was verified and a single-use token issued; the DELETE call has not consumed it. */
  AUTHORIZED: 'AUTHORIZED',
  /** Deletion accepted but the account still has active jobs, so finalization is deferred. */
  AWAITING_ACTIVE_JOBS: 'AWAITING_ACTIVE_JOBS',
  /** The sweeper is running finalization steps. */
  IN_PROGRESS: 'IN_PROGRESS',
  /** Terminal success. */
  COMPLETED: 'COMPLETED',
  /** Terminal failure; retries exhausted. */
  FAILED: 'FAILED',
} as const;

export type AccountDeletionStatus =
  (typeof AccountDeletionStatus)[keyof typeof AccountDeletionStatus];

/**
 * The idempotent finalization steps, run in order by the sweeper. Each step is
 * recorded only after it finishes, so a crash resumes from the last finished
 * step instead of redoing or skipping work. Internal to the server — never
 * exposed in DTOs.
 */
export const AccountDeletionStep = {
  LOCK: 'LOCK',
  PURGE_S3: 'PURGE_S3',
  PURGE_DB: 'PURGE_DB',
  DELETE_AUTH: 'DELETE_AUTH',
  FINALIZE: 'FINALIZE',
} as const;

export type AccountDeletionStep = (typeof AccountDeletionStep)[keyof typeof AccountDeletionStep];

/**
 * What `GET /users/me/deletion-status` returns: whether the caller can delete,
 * what deletion would remove, and whether finalization is deferred.
 */
export interface DeletionStatus {
  /** The scope the server will apply on delete — read it before showing UI copy. */
  scope: AccountDeletionScope;
  /** Whether the account also carries a customer profile, which survives PRO_PROFILE deletion. */
  hasCustomerProfile: boolean;
  /** Whether the account also carries a pro profile, which survives CUSTOMER_PROFILE deletion. */
  hasProProfile: boolean;
  /** Whether a fresh deletion could be authorized right now. */
  canAuthorize: boolean;
  /** A valid, unconsumed authorization already exists (the app can skip straight to confirm). */
  hasPendingAuthorization: boolean;
  /** ISO timestamp of the outstanding authorization's expiry, when one exists. */
  authorizationExpiresAt: string | null;
  /** Whether a deletion workflow is running or awaiting active jobs. */
  inProgress: boolean;
  /**
   * Whether finalization exhausted its retries leaving the account in a
   * half-deleted state that needs manual help. Terminal — signing in again will
   * not retry it.
   */
  failed: boolean;
  /** Whether deletion has already completed for this account. */
  deleted: boolean;
  /** How many active (blocking) jobs remain when finalization is deferred. */
  activeJobCount: number;
}

/**
 * The one-time confirmation token minted only after a verified fresh OTP
 * (`POST /users/me/deletion-authorization`). Shown exactly once; the server
 * stores only its SHA-256.
 */
export interface DeletionAuthorization {
  /** Single-use token; submit it in the `X-Deletion-Token` header. */
  token: string;
  /** ISO timestamp after which the token is no longer redeemable. */
  expiresAt: string;
  scope: AccountDeletionScope;
}

/** The `DELETE /users/me` acknowledgement. */
export interface DeletionAccepted {
  scope: AccountDeletionScope;
  /** True when finalization waits for active jobs; otherwise the workflow ran to completion. */
  deferredToActiveJobs: boolean;
}

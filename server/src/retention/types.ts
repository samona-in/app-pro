export const RETENTION_CATEGORIES = [
  'proDocuments',
  'selfies',
  'avatarsPro',
  'avatarsCustomer',
  'jobImages',
  'notificationsPro',
  'customerNotifications',
  'accountDeletionAudit',
  'savedAddresses',
  'proServicesSkills',
  'jobDeclinesOffers',
  'messages',
  'jobsCompleted',
  'jobsCancelled',
] as const;

export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

/**
 * Categories that must never be deleted automatically.
 *
 * These are either another party's record (customer avatars, saved addresses),
 * the historical record a marketplace exists to keep (messages, completed and
 * cancelled jobs), or a retention decision already made in
 * `docs/account-deletion-retention.md` (the account-deletion audit row). The
 * retention engine may count and report them for visibility, but it must never
 * remove them even if an operator sets both the enable flag and a period by
 * mistake. Promotion out of this set is a reviewed product/legal decision, not
 * a config change.
 */
export const REPORT_ONLY_CATEGORIES: ReadonlySet<RetentionCategory> = new Set([
  'avatarsCustomer',
  'accountDeletionAudit',
  'savedAddresses',
  'messages',
  'jobsCompleted',
  'jobsCancelled',
]);

export const LEGAL_HOLD_HOLDER_TYPES = [
  'PROFILE',
  'PRO_PROFILE',
  'DOCUMENT',
  'JOB',
  'CUSTOMER_PROFILE',
  'OTHER',
] as const;

export type LegalHoldHolderType = (typeof LEGAL_HOLD_HOLDER_TYPES)[number];

export interface RetentionPolicyConfig {
  // All periods in days. Undefined = unset (no automatic deletion).
  proDocuments?: number;
  selfies?: number;
  avatarsPro?: number;
  avatarsCustomer?: number;
  jobImages?: number;
  notificationsPro?: number;
  customerNotifications?: number;
  accountDeletionAudit?: number;
  savedAddresses?: number;
  proServicesSkills?: number;
  jobDeclinesOffers?: number;
  messages?: number;
  jobsCompleted?: number;
  jobsCancelled?: number;
}

export interface RetentionFeatureFlags {
  enabled: boolean; // global
  dryRunDefault: boolean;
  safetyWindowDays: number;
  categories: Record<RetentionCategory, boolean>;
  lockTtlMs: number;
  lockRetryMs: number;
}

/** A non-PII reference to one candidate record, for the dry-run sample. */
export interface RetentionItemRef {
  id: string;
  createdAt?: string | null;
  key?: string | null;
}

/** The result of an S3 orphan scan for one bucket prefix. */
export interface OrphanScanReport {
  bucket: string;
  prefix: string;
  scannedCount: number;
  referencedCount: number;
  orphanCount: number;
  sampleKeys: string[];
  secondCheckPassed: boolean;
  deletedCount: number;
}

/** One category's slice of a sweep report. Never carries PII. */
export interface CategoryReport {
  category: RetentionCategory;
  periodDays: number | null;
  enabled: boolean;
  reportOnly: boolean;
  /** Whether config + guards would permit a destructive delete. */
  deletable: boolean;
  expirationDate: string | null;
  eligibleCount: number;
  wouldDeleteCount: number;
  deletedCount: number;
  skippedLegalHold: number;
  skippedActiveJob: number;
  sample: RetentionItemRef[];
  truncated: boolean;
  orphan?: OrphanScanReport;
  error?: string;
}

export type SweepMode = 'DRY_RUN' | 'ACTUAL';

/** The structured, PII-free result of one retention sweep. */
export interface SweepReport {
  mode: SweepMode;
  skipped: boolean;
  reason?: string;
  startedAt: string;
  finishedAt: string;
  categories: CategoryReport[];
  totals: {
    eligible: number;
    wouldDelete: number;
    deleted: number;
    skippedLegalHold: number;
    skippedActiveJob: number;
  };
}

export interface CleanupAuditEntry {
  category: RetentionCategory;
  action: string;
  affectedCount: number;
  executionMode: 'DRY_RUN' | 'ACTUAL';
  startedAt: Date;
  finishedAt?: Date;
  success: boolean;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  jobId?: string | null;
}

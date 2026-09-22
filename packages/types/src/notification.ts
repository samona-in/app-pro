/**
 * Push notifications delivered to a professional.
 *
 * The `Notification` row records a push the API sent, so the Notifications
 * screen can list history. Recurring job alerts share one row and bump a
 * `repeats` counter rather than creating a new row per page. Mirrors
 * `NotificationKind` in the Prisma schema — keep the two in sync.
 */
export const NotificationKind = {
  JOB_ALERT: 'JOB_ALERT',
  JOB_STATUS: 'JOB_STATUS',
  PAYMENT: 'PAYMENT',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationKind = (typeof NotificationKind)[keyof typeof NotificationKind];

export const NOTIFICATION_KINDS = Object.values(NotificationKind);

/** A push notification as returned to its recipient. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** The deep-link route to open on tap; null when there is none. */
  route: string | null;
  /**
   * i18n key (in the recipient app's translation resources) that composes the
   * `title` line, with `params` as interpolation placeholders. Null on rows the
   * server composed in an unlocalized form; the client falls back to `title`.
   */
  messageKey: string | null;
  /**
   * i18n key that composes the `body` line. See `messageKey` for the contract;
   * the fallback value is `body`.
   */
  messageBodyKey: string | null;
  /**
   * Interpolation values for `messageKey` / `messageBodyKey`. Catalogue data
   * (service names, amounts) is passed through as-is — only the static copy is
   * localized, mirroring how the native overlay composes its own strings.
   */
  params: Record<string, string> | null;
  /** Whether the latest delivery attempt succeeded. */
  delivered: boolean;
  /** How many times this same alert has re-paged the pro. */
  repeats: number;
  /** When repeats stopped (job accepted, expired, cancelled). Null while open. */
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * A notice shown in the Customer app's Notifications screen.
 *
 * Unlike the pro `AppNotification`, this row records a *notice* the API chose
 * to surface (a job-status or payment event), not a push: it has delivery-free
 * fields and a per-row `readAt` that drives the bell's unread pill. Written by
 * the jobs domain at each transition it publishes (CLAUDE.md "Job State
 * Machine"); REST is the source of truth, and `notification:unread` only
 * nudges the pill.
 */
export interface CustomerNotification {
  id: string;
  /** The booking the notice is about; null for a system notice. */
  jobId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  /** The in-app route to open on tap; null when there is none. */
  route: string | null;
  /** When the customer opened it; null while unread. */
  readAt: string | null;
  createdAt: string;
}

/**
 * The customer's unread notification count. Returned by
 * `GET /notifications/unread-count` and pushed live on `notification:unread`
 * whenever a row is added or marked read.
 */
export interface CustomerNotificationUnread {
  unreadCount: number;
}

/**
 * Which push provider a device token belongs to.
 *
 * Android registers a raw FCM registration token so the server can reach FCM
 * directly (TTL, collapse key + per-job notification `tag`); iOS (and the Expo
 * fallback) keeps the Expo push service. Mirrors `PushProvider` in Prisma.
 */
export const PushProvider = {
  EXPO: 'EXPO',
  FCM: 'FCM',
} as const;

export type PushProvider = (typeof PushProvider)[keyof typeof PushProvider];

export const PUSH_PROVIDERS = Object.values(PushProvider);

/**
 * The payload of an incoming job alert, as raised natively and re-read by the
 * app. The server composes it from the job (no customer identity before
 * acceptance — see the jobs domain), and the native side keeps it until the job
 * is resolved or heavy-keyed by `jobId` for dedup.
 */
export interface IncomingJobAlert {
  jobId: string;
  /** pro_profiles.id of the professional the alert was paged to. */
  professionalId: string;
  /** Short heading, e.g. "Electrical job nearby". */
  title: string;
  /** Display name of the requested service. */
  serviceName: string;
  /**
   * Display name of the requested category within the service — the chosen
   * skill's name, or the free-text `customSkill` when "Other" was picked.
   */
  serviceCategory: string | null;
  /** Display label of the work location; null when unknown. */
  address: string | null;
  /** Straight-line distance from the recipient, metres; null when unknown. */
  distanceMeters: number | null;
  /** Guaranteed amount, in paise. */
  amountPaise: number;
  /** When the job stops being actionable (ISO); null when not set. */
  expiresAt: string | null;
  /** When the alert was first received (ISO). */
  receivedAt: string;
}

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
  /** Whether the latest delivery attempt succeeded. */
  delivered: boolean;
  /** How many times this same alert has re-paged the pro. */
  repeats: number;
  /** When repeats stopped (job accepted, expired, cancelled). Null while open. */
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * Shapes and display helpers for the read-only OTP delivery ledger.
 *
 * These mirror the contracts in `server/src/admin/otp/admin-otp.routes.ts`.
 * The admin app is a separate deployment and deliberately does not import
 * server or `@samona/types`. Neither contract contains a phone number, a phone
 * hash or an OTP — only the last two digits for support correlation.
 */

export const OTP_DELIVERY_STATUSES = [
  'SENT',
  'DELIVERED',
  'READ',
  'UNDELIVERED',
  'FAILED',
] as const;
export type OtpDeliveryStatus = (typeof OTP_DELIVERY_STATUSES)[number];

export const OTP_APPS = ['CUSTOMER', 'PRO'] as const;
export type OtpApp = (typeof OTP_APPS)[number];

export interface OtpAttemptListItem {
  id: string;
  requestedAt: string;
  app: OtpApp;
  phoneLast2: string;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  status: OtpDeliveryStatus;
  verificationSid: string | null;
  attemptSid: string | null;
  lastEventAt: string | null;
  eventCount: number;
}

export interface OtpDeliveryEvent {
  id: string;
  eventType: string;
  status: OtpDeliveryStatus;
  verificationSid: string | null;
  attemptSid: string | null;
  channel: string | null;
  mcc: string | null;
  mnc: string | null;
  numberSegments: number | null;
  eventTime: string;
  receivedAt: string;
}

export interface OtpAttemptDetail extends OtpAttemptListItem {
  deliveryEvents: OtpDeliveryEvent[];
}

export interface OtpAttemptListResponse {
  data: OtpAttemptListItem[];
  nextCursor: string | null;
}

export interface OtpAttemptDetailResponse {
  data: OtpAttemptDetail;
}

const STATUS_LABELS: Record<OtpDeliveryStatus, string> = {
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  UNDELIVERED: 'Undelivered',
  FAILED: 'Failed',
};

const STATUS_BADGE_CLASSES: Record<OtpDeliveryStatus, string> = {
  SENT: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  READ: 'bg-indigo-100 text-indigo-800',
  UNDELIVERED: 'bg-orange-100 text-orange-800',
  FAILED: 'bg-red-100 text-red-800',
};

export function otpStatusLabel(status: string): string {
  return STATUS_LABELS[status as OtpDeliveryStatus] ?? status.replace(/_/g, ' ');
}

export function otpStatusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status as OtpDeliveryStatus] ?? 'bg-gray-100 text-gray-700';
}

export function otpDeviceLabel(
  attempt: Pick<OtpAttemptListItem, 'deviceManufacturer' | 'deviceModel'>,
): string {
  const parts = [attempt.deviceManufacturer, attempt.deviceModel].filter((part): part is string =>
    Boolean(part),
  );
  return parts.length ? parts.join(' ') : 'Unknown device';
}

/** `com.twilio.…message.delivered` → "delivered" for a compact event label. */
export function otpEventLabel(eventType: string): string {
  const last = eventType.split('.').pop() ?? eventType;
  return last.replace(/_/g, ' ');
}

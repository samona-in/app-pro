import {
  JobStatus,
  ApiErrorCode,
  NotificationKind,
  type AppNotification,
  type ChatMessage,
  type CustomerNotification,
} from '@samona/types';
import type { PushPlatformInput, PushProviderInput } from '@samona/validation';
import type { AppType } from '@samona/config';
import type { PrismaClient } from '../database/prisma';
import type { AppConfig } from '../config';
import { logger } from '../common/logger';
import { badRequest, createHttpError, notFound } from '../common/errors';
import { distanceKm } from '../common/geo';
import { REALTIME_EVENTS, type RealtimeService } from '../realtime/gateway';
import { mintJobOffer } from '../jobs/job-offers';
import { createFcmClient, type FcmClient, type FcmMessagePayload, type FcmSendResult } from './fcm';
import { pushTokenId } from './push-token';

/**
 * Notifications domain service.
 *
 * Owns push delivery for professionals: registering a device token, persisting
 * the Pro's own job-alert preference, and delivering — on a repeating cadence —
 * the "new job" alert that breaks through a locked phone, a pocket or sleep
 * (the tawk.to-style repeating alert).
 *
 * Delivery is provider-aware. Android registers a raw Firebase registration
 * token (`provider: 'fcm'`) and the server sends FCM HTTP v1 messages directly:
 * a display notification the system tray renders even when the app process is
 * dead, plus job data the native service turns into the Rapido-style overlay,
 * loops the alarm, and keys per job (FCM `tag`/`collapseKey` = jobId so repeats
 * replace rather than stack). iOS (and any legacy Expo token) keeps the Expo
 * push service. When neither provider is configured the rows are still recorded
 * but nothing is sent — the same local-development contract as before.
 *
 * REST stays the source of truth; a push is a nudge to look, never a state
 * change. Each delivered alert is persisted to `notifications` so the app can
 * list history and the scheduler knows who still needs paging.
 *
 * Scheduled repeats run in-process with `setInterval`, keyed off unresolved
 * `Notification` rows. This is fine while there is one server process; the
 * realtime gateway already documents the same single-process limitation and
 * the fix (a shared queue / Redis adapter) is a later, infrastructure change.
 */

export interface NotificationsServiceDeps {
  prisma: PrismaClient;
  config: AppConfig;
  /**
   * The socket fan-out used to nudge a customer's bell pill on
   * `notification:unread`. Optional only so unit tests that never exercise
   * customer notices can build the service with prisma + config alone.
   */
  realtime?: RealtimeService;
}

/** The shape the jobs domain hands over when a job opens for a list of pros. */
export interface JobAlertRecipient {
  /** pro_profiles.id — the join key to a `Notification` row. */
  proId: string;
  /** Straight-line distance between this pro and the request, km. */
  distanceKm?: number | null;
}

/** The caller-supplied part of a job alert's content (no per-recipient state). */
export type JobAlertInfoInput = {
  jobId: string;
  /** Display name of the requested service. */
  serviceName: string;
  /**
   * The requested category within the service — the chosen skill's name, or
   * the free-text `customSkill` when the "Other" skill was picked.
   */
  serviceCategory: string;
  /** The free-text category when the skill is "other". */
  customSkill: string | null;
  /** Short description of the requested work. */
  description: string;
  /** Guaranteed amount, in paise. */
  basePayPaise: number;
  /** Display label of the work location (never the customer's name). */
  address: string | null;
  /** ISO instant the job stops being actionable. Null when the sweep will own it. */
  expiresAt: string | null;
};

/** A fully-assembled job alert for one recipient, ready to be pushed. */
export interface JobAlertInfo extends JobAlertInfoInput {
  /** pro_profiles.id of the recipient — the payload's `professionalId`. */
  professionalId: string;
  /** Straight-line distance from this recipient to the job, km. */
  distanceKm: number | null;
}

/**
 * Which delivery channel a registered token belongs to. Mirrors the Prisma
 * `PushProvider` enum; null means a legacy registration that used Expo.
 */
type PushTargetProvider = 'EXPO' | 'FCM' | null;

/** The types of terminal pushes the native side uses to silence/cancel alerts. */
export type JobAlertTerminalType = 'JOB_ACCEPTED' | 'JOB_CANCELLED' | 'JOB_EXPIRED';

/** Why a job left the open pool; maps to `JobAlertTerminalType` when pushed. */
export type JobAlertResolveReason = 'ACCEPTED' | 'CANCELLED' | 'EXPIRED' | 'NONE';

const ROUTE_PREFIX = 'samonapro://job/';

/** Server-side view of a push target's OS (mirrors the Prisma enum values). */
type PushTargetPlatform = 'ANDROID' | 'IOS' | null;

type PushTarget = {
  pushToken: string;
  pushPlatform: PushTargetPlatform;
  pushProvider: PushTargetProvider;
  deviceId: string | null;
};

const pushDeviceSelect = {
  pushToken: true,
  pushPlatform: true,
  pushProvider: true,
  deviceId: true,
} as const;

/** Prefer per-install registrations, with a fallback for legacy profiles. */
function pushTargetsOf(pro: {
  pushToken?: string | null;
  pushPlatform?: PushTargetPlatform;
  pushProvider?: PushTargetProvider;
  pushDeviceId?: string | null;
  pushDevices?: {
    pushToken: string;
    pushPlatform: PushTargetPlatform;
    pushProvider: PushTargetProvider;
    deviceId: string;
  }[];
}): PushTarget[] {
  if (pro.pushDevices?.length) {
    return pro.pushDevices.map((device) => ({
      ...device,
      deviceId: device.deviceId.startsWith('legacy:') ? null : device.deviceId,
    }));
  }
  return pro.pushToken
    ? [
        {
          pushToken: pro.pushToken,
          pushPlatform: pro.pushPlatform ?? null,
          pushProvider: pro.pushProvider ?? null,
          deviceId: pro.pushDeviceId ?? null,
        },
      ]
    : [];
}

/** The notification channel job alerts raise on (Android). */
const JOB_ALERT_CHANNEL = 'incoming_jobs';

/** The notification channel customer booking-status pushes raise on (Android). */
const CUSTOMER_STATUS_CHANNEL = 'job_updates';

/** The push types the jobs domain can raise for a customer. */
export type CustomerPushType = 'JOB_OTP' | 'JOB_STATUS';

function notificationRoute(jobId: string): string {
  // Deep links carry the trip-screen path (`/active`) — the former `job/[id]`
  // details route no longer exists in the app.
  return `${ROUTE_PREFIX}${jobId}/active`;
}

function pushProviderOf(pro: { pushProvider?: 'EXPO' | 'FCM' | null }): PushTargetProvider {
  return pro.pushProvider ?? null;
}

/** Prisma errors may embed token-bearing queries; only log allowlisted codes. */
function tokenStorageFailure(
  error: unknown,
  context?: { operation: 'register'; surface: 'pro' | 'customer'; elapsedMs: number },
): never {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  logger.warn('[Push] Device token storage failed.', {
    ...context,
    code: /^(P\d{4}|[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(code) ? code : 'UNKNOWN',
  });
  throw createHttpError(
    503,
    ApiErrorCode.INTERNAL,
    'Device token synchronization is temporarily unavailable.',
  );
}

/* -------------------------------------------------------------------------- */
/* Payload builders                                                           */
/* -------------------------------------------------------------------------- */

/** Format an amount in paise as ₹ with two decimals, e.g. ₹450.00. */
function formatPay(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** The push body for a job alert, shared by the first send and every repeat. */
function jobAlertTitle(info: JobAlertInfo): string {
  return `${info.customSkill ?? info.serviceName} job nearby`;
}

/** The pro app's i18n keys + params that compose a job-alert row's copy. */
function jobAlertMessage(info: JobAlertInfo): {
  messageKey: string;
  messageBodyKey: string;
  params: Record<string, string>;
} {
  return {
    messageKey: 'notifications.newJob.titleSpecific',
    messageBodyKey: 'notifications.newJob.body',
    params: {
      service: info.customSkill ?? info.serviceName,
      // Descriptions are optional; fall back to the category so the alert never
      // reads " — ₹500. Tap to see and accept."
      description: info.description || info.serviceCategory,
      pay: formatPay(info.basePayPaise),
    },
  };
}

function jobAlertBody(info: JobAlertInfo): string {
  const description = info.description || info.serviceCategory;
  return `${description} — ${formatPay(info.basePayPaise)}. Tap to see and accept.`;
}

/** FCM `data` mandates string values; the native side stringifies on read. */
function toFcmData(values: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      data[key] = '';
    } else {
      data[key] = typeof value === 'string' ? value : String(value);
    }
  }
  return data;
}

/**
 * The full job data carried by a NEW_JOB message, shared by both providers.
 *
 * No customer identity by design (CLAUDE.md "Security" and the jobs domain: the
 * pro meets the customer only once committed). The address is the job's own
 * snapshotted location label and distance is per recipient, so the alert can
 * say "3 km away" without revealing who placed it.
 */
function jobAlertData(info: JobAlertInfo, config: AppConfig): Record<string, unknown> {
  return {
    type: 'NEW_JOB',
    kind: NotificationKind.JOB_ALERT,
    jobId: info.jobId,
    professionalId: info.professionalId,
    title: jobAlertTitle(info),
    serviceName: info.serviceName,
    serviceCategory: info.serviceCategory,
    address: info.address,
    distanceMeters:
      info.distanceKm !== null && info.distanceKm !== undefined
        ? Math.round(info.distanceKm * 1000)
        : null,
    amountPaise: info.basePayPaise,
    expiresAt: info.expiresAt ?? new Date(Date.now() + config.jobExpireTtlMs).toISOString(),
  };
}

/**
 * Builds the Expo push payload for a job alert.
 *
 * Android uses a DISPLAY message (top-level title/body/channelId): FCM renders
 * it in the system tray even when the app process is dead (killed / swiped
 * away), which a data-only message never reaches — FCM drops data messages
 * once the process is gone. When the app IS running, FCM still hands the
 * display message to `onMessageReceived`, so the native service raises its
 * alert; tapping the tray notification relaunches the app into the
 * `job-alert/[id]` route. The full job payload stays in `data` on both
 * platforms so the client can route straight to the ring.
 */
export function buildPushMessage(
  pushToken: string,
  message: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    channelId?: string;
  },
  platform: PushTargetPlatform,
): Record<string, unknown> {
  if (platform === 'ANDROID') {
    return {
      to: pushToken,
      priority: 'high',
      title: message.title,
      body: message.body,
      sound: 'default',
      channelId: message.channelId ?? JOB_ALERT_CHANNEL,
      data: { ...message.data, title: message.title, body: message.body },
    };
  }
  return {
    to: pushToken,
    title: message.title,
    body: message.body,
    data: message.data,
    sound: 'default',
    priority: 'high',
    // The channel the alert raises on (honoured for display messages).
    channelId: message.channelId ?? JOB_ALERT_CHANNEL,
    // iOS: allow this to break through "do not disturb"-tier noise.
    interruptionLevel: 'time-sensitive',
  };
}

/**
 * Builds an FCM HTTP v1 push. Campaigns and ordinary alerts carry a display
 * notification so Android can present them while the app is backgrounded.
 *
 * NEW_JOB stays deliberately DATA-ONLY. `firebase-messaging`'s `dispatchMessage` short-
 * circuits when a message carries a top-level `notification` (or
 * `android.notification`) block: it renders the tray notification itself via
 * `DisplayNotification` and NEVER calls `onMessageReceived` — so the native
 * overlay, looping alarm and Accept/Decline actions would never run, no matter
 * which service wins `MESSAGING_EVENT` resolution. With a data-only message
 * FCM always falls through to `onMessageReceived`, where the pro-side
 * `JobAlertMessagingService` raises the alert (overlay + `incoming_jobs`
 * channel + `job_alert` sound) using the same per-job ids. The online
 * foreground service keeps the process alive while the pro is online, which is
 * what lets a backgrounded app receive these data messages at all. `ttl` is the
 * configured accept window, bounded far below the job-expiry TTL so a stale
 * offer cannot surface hours later; `collapseKey` is the job id so duplicates
 * replace rather than stack.
 */
export function buildFcmPushMessage(
  message: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    channelId?: string;
  },
  options: { ttlMs: number; collapseKey: string },
): FcmMessagePayload {
  const isJobAlert = message.data.type === 'NEW_JOB';
  return {
    ...(isJobAlert ? {} : { notification: { title: message.title, body: message.body } }),
    data: toFcmData({
      ...message.data,
      ...(isJobAlert ? {} : { title: message.title, body: message.body }),
    }),
    android: {
      priority: 'high',
      // FCM's android.ttl is a protobuf Duration: whole seconds with an `s`
      // suffix only — `ms` is not a valid duration unit. Rounded up so a
      // sub-second TTL never collapses to zero.
      ttl: `${Math.ceil(options.ttlMs / 1000)}s`,
      collapseKey: options.collapseKey,
      ...(isJobAlert
        ? {}
        : {
            notification: { channelId: message.channelId ?? JOB_ALERT_CHANNEL, sound: 'default' },
          }),
    },
  };
}

/** Data-only terminal message telling the native side to drop a job alert. */
export function buildFcmTerminalMessage(
  type: JobAlertTerminalType,
  jobId: string,
): FcmMessagePayload {
  return { data: { type, jobId } };
}

/**
 * Data-only message telling the *assigned* pro's native side to raise a
 * persistent "job cancelled by the customer" alert.
 *
 * Distinct from the `JOB_CANCELLED` terminal message: that one clears an open
 * offer, whereas this one presents a cancellation the pro committed to. The
 * `cancelledAt` timestamp (ISO) is the same value stamped on the job row and
 * carried by the `job:status` socket event, so the two surfaces deduplicate to
 * a single logical alert (one modal, one vibration).
 */
export function buildFcmAssignmentCancelMessage(
  jobId: string,
  cancelledAt: Date,
): FcmMessagePayload {
  return {
    data: { type: 'JOB_CANCELLED_ASSIGNED', jobId, cancelledAt: cancelledAt.toISOString() },
    android: { priority: 'high', collapseKey: jobId },
  };
}

/** A persisted notification row, mapped to the client DTO. */
type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  messageKey: string | null;
  messageBodyKey: string | null;
  params: Record<string, string> | null;
  route: string | null;
  delivered: boolean;
  repeats: number;
  resolvedAt: Date | null;
  createdAt: Date;
};

function toDto(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    messageKey: row.messageKey,
    messageBodyKey: row.messageBodyKey,
    params: row.params,
    route: row.route,
    delivered: row.delivered,
    repeats: row.repeats,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A persisted customer notice row, mapped to the client DTO. */
type CustomerNotificationRow = {
  id: string;
  jobId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  route: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toCustomerDto(row: CustomerNotificationRow): CustomerNotification {
  return {
    id: row.id,
    jobId: row.jobId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    route: row.route,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Builds the Expo push client on first use.
 *
 * `expo-server-sdk` is an ESM-only package and the server compiles to CommonJS,
 * so we resolve it with a lazy dynamic `import()` and cache the client. When no
 * token is configured we return null and simply record rows without reaching
 * Expo's servers (local development).
 */
export function createNotificationsService(deps: NotificationsServiceDeps) {
  const { prisma, config } = deps;

  let expoClientPromise: Promise<{
    sendPushNotificationsAsync(msgs: unknown[]): Promise<unknown[]>;
    getPushNotificationReceiptsAsync(
      receiptIds: string[],
    ): Promise<
      Record<string, { status: string; message?: string; details?: Record<string, unknown> }>
    >;
    isExpoPushToken?(token: string): boolean;
  } | null> | null = null;

  let fcmClient: FcmClient | null = null;
  // Avoid re-sending a rejected token from an already-loaded scheduler batch.
  // The database deletion is the durable source of truth across processes.
  const rejectedTokens = new Set<string>();

  async function deleteRejectedToken(token: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.proPushDevice.deleteMany({ where: { pushToken: token } });
      await tx.proProfile.updateMany({
        where: { pushToken: token },
        data: { pushToken: null, pushPlatform: null, pushProvider: null, pushDeviceId: null },
      });
      await tx.customerProfile.updateMany({
        where: { pushToken: token },
        data: { pushToken: null, pushPlatform: null, pushProvider: null },
      });
    });
    logger.info(`[Push] Deleted rejected token=${pushTokenId(token)}.`);
  }

  /** Shared by job, terminal, cancellation, chat and campaign FCM delivery. */
  async function sendFcm(token: string, message: FcmMessagePayload): Promise<FcmSendResult> {
    if (rejectedTokens.has(token)) {
      // Retry cleanup if an earlier database write failed, never the delivery.
      try {
        await deleteRejectedToken(token);
      } catch {
        logger.error(`[Push] Rejected-token cleanup failed, token=${pushTokenId(token)}.`);
      }
      return { ok: false, errorCode: 'UNREGISTERED', invalidToken: true };
    }
    const client = getFcmClient();
    if (!client) return { ok: false, error: 'FCM is not configured.' };
    const result = await client.send(token, message);
    if (result.invalidToken) {
      rejectedTokens.add(token);
      if (rejectedTokens.size > 10000) rejectedTokens.delete(rejectedTokens.values().next().value!);
      try {
        await deleteRejectedToken(token);
      } catch {
        // Do not log the Prisma exception: its query can include full tokens.
        logger.error(`[Push] Rejected-token cleanup failed, token=${pushTokenId(token)}.`);
      }
    }
    return result;
  }

  async function getExpoClient() {
    if (!config.expoAccessToken) return null;
    if (!expoClientPromise) {
      expoClientPromise = import('expo-server-sdk')
        .then((mod) => {
          const Expo =
            (
              mod as {
                default?: { new (o: unknown): unknown };
                Expo?: { new (o: unknown): unknown };
              }
            ).Expo ??
            (
              mod as {
                default?: { new (o: unknown): unknown };
                Expo?: { new (o: unknown): unknown };
              }
            ).default;
          if (!Expo) throw new Error('expo-server-sdk did not expose an Expo client.');
          const client = new Expo({ accessToken: config.expoAccessToken }) as unknown as {
            sendPushNotificationsAsync(msgs: unknown[]): Promise<unknown[]>;
            getPushNotificationReceiptsAsync(
              receiptIds: string[],
            ): Promise<
              Record<
                string,
                { status: string; message?: string; details?: Record<string, unknown> }
              >
            >;
            isExpoPushToken?(token: string): boolean;
          };
          return client;
        })
        .catch((error: unknown) => {
          // Keep the process alive if the SDK fails to load; push simply won't send.
          expoClientPromise = null;
          logger.error('Could not load the Expo push client.', error);
          return null;
        });
    }
    return expoClientPromise;
  }

  /** The FCM client, built once from configured credentials or null. */
  function getFcmClient(): FcmClient | null {
    if (fcmClient) return fcmClient;
    if (config.fcmProjectId && config.fcmClientEmail && config.fcmPrivateKey) {
      fcmClient = createFcmClient({
        projectId: config.fcmProjectId,
        clientEmail: config.fcmClientEmail,
        privateKey: config.fcmPrivateKey,
      });
      return fcmClient;
    }
    return null;
  }

  /**
   * One-off push to a single token over the provider it belongs to. A null
   * provider (legacy registration) and any iOS token go through Expo.
   */
  async function sendPush(
    pushToken: string,
    message: {
      title: string;
      body: string;
      data: Record<string, unknown>;
      channelId?: string;
    },
    platform: PushTargetPlatform,
    provider: PushTargetProvider,
  ): Promise<{ ok: boolean; providerRef?: string; error?: string }> {
    if (provider === 'FCM') {
      const client = getFcmClient();
      if (!client) {
        // Local dev without credentials: record but do not fail the request.
        logger.warn(
          '[Push] FCM is not configured (FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY) — skipping an Android job alert.',
        );
        return { ok: false };
      }
      const result: FcmSendResult = await sendFcm(
        pushToken,
        buildFcmPushMessage(message, {
          ttlMs: config.jobAlertTtlMs,
          collapseKey: String(message.data.jobId ?? message.data.campaignId ?? 'job-alert'),
        }),
      );
      return { ok: result.ok, providerRef: result.messageId, error: result.error };
    }

    const client = await getExpoClient();
    if (!client) {
      // Local dev without a token: record but do not fail the request.
      logger.warn(
        '[Push] No Expo access token configured — push delivery disabled. Set EXPO_ACCESS_TOKEN.',
      );
      return { ok: false };
    }

    try {
      const tickets = await client.sendPushNotificationsAsync([
        buildPushMessage(pushToken, message, platform),
      ]);
      const ticket = tickets?.[0] as
        { status: string; id?: string; details?: { error?: string } } | undefined;
      if (ticket?.status === 'ok') {
        logger.info(
          `[Push] Sent token=${pushTokenId(pushToken)} for job ${String(message.data.jobId ?? 'unknown')}: ticket ${ticket.id ?? 'no-id'}`,
        );
        return { ok: true, providerRef: ticket.id };
      }
      logger.warn(`[Push] Expo rejected token=${pushTokenId(pushToken)}.`);
      if (ticket?.details?.error === 'DeviceNotRegistered') await deleteRejectedToken(pushToken);
      return { ok: false, error: 'Push rejected by Expo.' };
    } catch {
      logger.error(`[Push] Push send failed, token=${pushTokenId(pushToken)}.`);
      return { ok: false, error: 'Push failed.' };
    }
  }

  /**
   * Data-only terminal push, used to stop a native overlay + looping sound the
   * instant the job leaves the open pool. Only the FCM path carries this (the
   * Android native side is what needs it); iOS clears alerts from the socket
   * status event.
   */
  async function sendTerminalAlert(
    pushToken: string,
    jobId: string,
    type: JobAlertTerminalType,
  ): Promise<void> {
    const client = getFcmClient();
    if (!client) {
      logger.warn(`[Push] FCM not configured — skipping terminal ${type} push for job ${jobId}.`);
      return;
    }
    const result = await sendFcm(pushToken, buildFcmTerminalMessage(type, jobId));
    if (!result.ok) {
      logger.warn(`[Push] Terminal ${type} push for job ${jobId} was not delivered.`);
    }
  }

  /**
   * Data-only cancellation push to the pro *assigned* to a job just cancelled
   * by its customer.
   *
   * The terminal push (`resolveJobAlerts`) only reaches pros still holding an
   * open offer; a pro who already committed holds no alert, so they would never
   * hear about the cancellation while their process is dead. This mirrors the
   * same native FCM surface with the `JOB_CANCELLED_ASSIGNED` data type the
   * native messaging service presents as a persistent alert. FCM-only (the
   * native presentation is Android); resolves quietly when the pro has no token,
   * uses non-FCM delivery, or FCM is unconfigured — the socket is still the
   * source of truth while the app is alive.
   */
  async function sendAssignedCancellationProPush(
    proUserId: string,
    jobId: string,
    cancelledAt: Date,
  ): Promise<void> {
    const pro = await prisma.proProfile.findUnique({
      where: { userId: proUserId },
      select: { pushToken: true, pushProvider: true, pushDevices: { select: pushDeviceSelect } },
    });
    if (!pro) return;
    const client = getFcmClient();
    if (!client) {
      logger.warn(
        '[Push] FCM is not configured — skipping assigned-cancellation push for job ' + `${jobId}.`,
      );
      return;
    }
    await Promise.all(
      pushTargetsOf(pro)
        .filter((target) => target.pushProvider === 'FCM')
        .map(async (target) => {
          const result = await sendFcm(
            target.pushToken,
            buildFcmAssignmentCancelMessage(jobId, cancelledAt),
          );
          if (!result.ok)
            logger.warn(`[Push] Assigned-cancellation push for job ${jobId} was not delivered.`);
        }),
    );
  }

  /**
   * Checks push receipt IDs for delivery status and cleans up tokens that Expo
   * reports as no longer registered.
   *
   * Expo only accepts a ticket as "queued"; the receipt confirms real delivery.
   * We poll the receipts for tickets we just sent so a failed/invalid token is
   * discovered promptly and never retried.
   */
  async function checkPushReceipts(
    receiptIds: string[],
    proId: string,
    token: string,
  ): Promise<void> {
    if (receiptIds.length === 0) return;
    const client = await getExpoClient();
    if (!client?.getPushNotificationReceiptsAsync) return;

    try {
      const receipts = await client.getPushNotificationReceiptsAsync(receiptIds);
      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status !== 'ok') {
          logger.warn(`[Push] Receipt ${id} failed for pro ${proId}, token=${pushTokenId(token)}.`);
          // Expo stopped accepting this token (device uninstalled / app removed).
          // Stop both delivering to it and paging it further until it re-registers.
          if (receipt.details?.error === 'DeviceNotRegistered') await deleteRejectedToken(token);
        } else {
          logger.debug(`[Push] Receipt ${id} for pro ${proId}: delivered.`);
        }
      }
    } catch {
      logger.error(`[Push] Receipt check failed, token=${pushTokenId(token)}.`);
    }
  }

  /**
   * Persists (or re-arms) one pro's job-alert row. The row is the record of an
   * offer and the source the scheduler resolves when the job leaves the open
   * pool — so it is written whether or not a push could actually be delivered;
   * `delivered` records the push outcome.
   *
   * When `rearm` is set the existing row is un-resolved (resolvedAt → null) so
   * the repeating scheduler can page the pro again. The repeat counter is
   * incremented to track how many times this pro has been alerted for the job.
   */
  async function upsertAlert(
    proId: string,
    info: JobAlertInfo,
    result: { ok: boolean; providerRef?: string | null },
    isRepeat: boolean,
    rearm = false,
  ): Promise<void> {
    await prisma.notification.upsert({
      where: {
        proId_jobId_kind: { proId, jobId: info.jobId, kind: NotificationKind.JOB_ALERT },
      },
      create: {
        proId,
        jobId: info.jobId,
        kind: NotificationKind.JOB_ALERT,
        title: jobAlertTitle(info),
        body: jobAlertBody(info),
        ...jobAlertMessage(info),
        route: notificationRoute(info.jobId),
        delivered: result.ok,
        providerRef: result.providerRef,
        repeats: isRepeat ? 1 : 0,
      },
      update: rearm
        ? {
            delivered: result.ok,
            ...(result.providerRef ? { providerRef: result.providerRef } : {}),
            resolvedAt: null,
            repeats: { increment: 1 },
          }
        : isRepeat
          ? {
              delivered: result.ok,
              ...(result.providerRef ? { providerRef: result.providerRef } : {}),
              repeats: { increment: 1 },
            }
          : {},
    });
  }

  /** Writes (or re-arms) one pro's job-alert row and delivers the push. */
  async function alertOne(
    proId: string,
    info: JobAlertInfo,
    targets: PushTarget[],
    isRepeat: boolean,
    rearm = false,
  ): Promise<void> {
    const results = await Promise.all(
      targets.map(async (target) => {
        const data = jobAlertData(info, config);
        if (!rejectedTokens.has(target.pushToken)) {
          await attachOfferData(data, proId, info.jobId, target.deviceId, target.pushProvider);
        }
        const result = await sendPush(
          target.pushToken,
          {
            title: jobAlertTitle(info),
            body: jobAlertBody(info),
            data,
          },
          target.pushPlatform,
          target.pushProvider,
        );
        if (target.pushProvider !== 'FCM' && result.ok && result.providerRef) {
          void checkPushReceipts([result.providerRef], proId, target.pushToken);
        }
        return result;
      }),
    );
    await upsertAlert(
      proId,
      info,
      results.find((result) => result.ok) ?? { ok: false },
      isRepeat,
      rearm,
    );
  }

  /**
   * Mints one signed, single-use job-offer token for this push and attaches it
   * to the payload, so the native Android overlay can Accept/Reject directly
   * without the app process being alive.
   *
   * Only FCM recipients whose install has a registered device id get a token:
   * there is no native direct-Accept path on any other channel, so minting the
   * ledger row is pure waste there. When the secret is unset (local dev) every
   * push simply lacks a token and the native side falls back to opening the app.
   */
  async function attachOfferData(
    data: Record<string, unknown>,
    proId: string,
    jobId: string,
    deviceId: string | null,
    provider: PushTargetProvider,
  ): Promise<void> {
    if (!config.jobOfferSecret || provider !== 'FCM' || !deviceId) return;
    try {
      const minted = mintJobOffer({
        proId,
        jobId,
        deviceId,
        secret: config.jobOfferSecret,
        ttlMs: config.jobOfferTtlMs,
      });
      await prisma.jobOffer.create({
        data: {
          jobId,
          proId,
          tokenHash: minted.tokenHash,
          deviceId,
          expiresAt: minted.expiresAt,
        },
      });
      data.jobOfferToken = minted.token;
      data.offerExpiresAt = minted.expiresAt.toISOString();
    } catch (error) {
      // Never fail the alert over a mint; the native side just falls back to
      // opening the app, the same as when the secret is unset.
      logger.error(`[Push] Could not mint job offer for pro ${proId} on job ${jobId}.`, error);
    }
  }

  /**
   * Pushes a new-job alert to each recipient, once, and arms it for repeats.
   *
   * Called by the jobs domain right after the matching emit, so the pro gets a
   * push even with the app killed/backgrounded/locked. Each recipient gets one
   * `Notification` row keyed to the job; the scheduler re-pages the same row
   * (bumping `repeats`) until the alert is resolved.
   */
  async function alertEligiblePros(
    recipients: JobAlertRecipient[],
    info: JobAlertInfoInput,
  ): Promise<void> {
    if (recipients.length === 0) return;

    const pros = await prisma.proProfile.findMany({
      where: { id: { in: recipients.map((r) => r.proId) } },
      select: {
        id: true,
        pushToken: true,
        pushPlatform: true,
        pushProvider: true,
        pushDeviceId: true,
        pushDevices: { select: pushDeviceSelect },
        jobAlertsEnabled: true,
      },
    });

    logger.info(
      `[Push] Job ${info.jobId} opened for ${recipients.length} pros; ${pros.length} have profiles.`,
    );

    await Promise.all(
      pros.map(async (pro) => {
        const recipient = recipients.find((r) => r.proId === pro.id);
        const infoForRecipient: JobAlertInfo = {
          ...info,
          professionalId: pro.id,
          distanceKm: recipient?.distanceKm ?? null,
        };

        // Skip anyone who turned alerts off or has no token yet.
        if (!pro.jobAlertsEnabled || pushTargetsOf(pro).length === 0) {
          logger.warn(
            `[Push] Skipping pro ${pro.id} for job ${info.jobId}: ${!pro.jobAlertsEnabled ? 'alerts disabled' : 'no push token stored'}`,
          );
          // No push can go out, but the offer is still recorded so the alert
          // can be re-sent later and the pool knows this pro was paged.
          await upsertAlert(pro.id, infoForRecipient, { ok: false, providerRef: null }, false);
          return;
        }
        await alertOne(pro.id, infoForRecipient, pushTargetsOf(pro), false);
      }),
    );
  }

  /**
   * Re-alerts eligible pros after a job returns to the open pool (pro release).
   *
   * Unlike the initial `alertEligiblePros` this enforces a per-pro cooldown:
   * a pro who was alerted recently for this job is not bombarded again until
   * `cooldownMs` has elapsed since their last alert (`Notification.updatedAt`).
   *
   * - Fresh pros (never alerted): normal immediate push.
   * - Cooled-down pros (last alert ≥ cooldownMs ago): re-arm alert row + push.
   * - Within-cooldown pros: skipped (no push; the JOB_NEW socket event
   *   surfaces the job to online pros regardless).
   */
  async function reAlertEligiblePros(
    recipients: JobAlertRecipient[],
    info: JobAlertInfoInput,
    cooldownMs: number,
  ): Promise<void> {
    if (recipients.length === 0) return;

    const proIds = recipients.map((r) => r.proId);

    // Fetch profiles + any existing alert rows for this (pro, job) pair.
    const [pros, existingAlerts] = await Promise.all([
      prisma.proProfile.findMany({
        where: { id: { in: proIds } },
        select: {
          id: true,
          pushToken: true,
          pushPlatform: true,
          pushProvider: true,
          pushDeviceId: true,
          pushDevices: { select: pushDeviceSelect },
          jobAlertsEnabled: true,
        },
      }),
      prisma.notification.findMany({
        where: {
          jobId: info.jobId,
          proId: { in: proIds },
          kind: NotificationKind.JOB_ALERT,
        },
        select: { proId: true, updatedAt: true },
      }),
    ]);

    const lastAlertedAt = new Map<string, Date>(
      existingAlerts.map((row) => [row.proId, row.updatedAt]),
    );

    const now = Date.now();

    await Promise.all(
      pros.map(async (pro) => {
        const recipient = recipients.find((r) => r.proId === pro.id);
        const infoForRecipient: JobAlertInfo = {
          ...info,
          professionalId: pro.id,
          distanceKm: recipient?.distanceKm ?? null,
        };

        if (!pro.jobAlertsEnabled || pushTargetsOf(pro).length === 0) {
          // Still record the offer for history, but skip delivery.
          await upsertAlert(pro.id, infoForRecipient, { ok: false, providerRef: null }, false);
          return;
        }

        const previous = lastAlertedAt.get(pro.id);

        // Never alerted before → normal immediate push (treat as fresh).
        if (!previous) {
          await alertOne(pro.id, infoForRecipient, pushTargetsOf(pro), false);
          return;
        }

        const elapsed = now - previous.getTime();
        if (elapsed < cooldownMs) {
          // Within cooldown — leave resolved, no push. The JOB_NEW socket
          // event shows the job to online pros; background pros on cooldown
          // won't be bombarded.
          return;
        }

        // Cooled-down pro: re-arm the alert row + send a fresh push.
        await alertOne(
          pro.id,
          infoForRecipient,
          pushTargetsOf(pro),
          false,
          true, // rearm
        );
      }),
    );
  }

  /**
   * Stops every open job-alert row for a job and pages the affected pros so
   * their native overlay, sound and tray entry go away at once.
   *
   * Called when a job leaves the open pool (accepted, expired, cancelled). The
   * row stays for history; `resolvedAt` just stops the scheduler from paging
   * again. The pro who acted resolves their own alert through the app, so the
   * extra FCM nudge goes to whoever may still be holding the offer.
   */
  async function resolveJobAlerts(
    jobId: string,
    terminal: JobAlertResolveReason = 'CANCELLED',
  ): Promise<void> {
    const open = await prisma.notification.findMany({
      where: { jobId, kind: NotificationKind.JOB_ALERT, resolvedAt: null },
      select: {
        pro: {
          select: {
            pushToken: true,
            pushPlatform: true,
            pushProvider: true,
            pushDevices: { select: pushDeviceSelect },
          },
        },
      },
    });

    await prisma.notification.updateMany({
      where: { jobId, kind: NotificationKind.JOB_ALERT, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });

    if (terminal === 'NONE') return;

    const terminalType: JobAlertTerminalType =
      terminal === 'ACCEPTED'
        ? 'JOB_ACCEPTED'
        : terminal === 'EXPIRED'
          ? 'JOB_EXPIRED'
          : 'JOB_CANCELLED';

    // Tell every pro still showing the alert to drop it instantly — no waiting
    // for the next repeat or a socket reconnect.
    await Promise.all(
      open.map(async (row) => {
        await Promise.all(
          pushTargetsOf(row.pro)
            .filter((target) => target.pushProvider === 'FCM')
            .map((target) => sendTerminalAlert(target.pushToken, jobId, terminalType)),
        );
      }),
    );
  }

  /** The Pro's own notification history, newest first. */
  async function listForPro(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<AppNotification[]> {
    const pro = await prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!pro) return [];

    const rows = await prisma.notification.findMany({
      where: { proId: pro.id, ...(options.cursor ? { id: { lt: options.cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(options.limit ?? 20, 50)),
    });
    return rows.map((row) => toDto(row as unknown as NotificationRow));
  }

  /* ------------------------------------------------------------------------ */
  /* Customer notices                                                         */
  /* ------------------------------------------------------------------------ */

  /**
   * Persists one notice for a customer and nudges their bell pill live.
   *
   * Invoked by the jobs domain at each status/payment transition it publishes,
   * with the `customerId` (customer_profiles.id) it already holds and the
   * customer's `userId` (the socket key for the `notification:unread` nudge).
   * The row is the feature — REST is the source of truth for what the
   * Notifications screen shows; the realtime event only moves the unread pill.
   */
  async function recordCustomerNotification(input: {
    customerId: string;
    customerUserId: string;
    jobId?: string | null;
    kind: NotificationKind;
    title: string;
    body: string;
    route?: string | null;
  }): Promise<CustomerNotification> {
    const row = await prisma.customerNotification.create({
      data: {
        customerId: input.customerId,
        jobId: input.jobId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body,
        route: input.route ?? null,
      },
    });
    await emitUnreadForCustomer(input.customerUserId);
    return toCustomerDto(row);
  }

  /** The customer's own notices, newest first. */
  async function listForCustomer(
    customerUserId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<CustomerNotification[]> {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true },
    });
    if (!customer) return [];

    const rows = await prisma.customerNotification.findMany({
      where: { customerId: customer.id, ...(options.cursor ? { id: { lt: options.cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(options.limit ?? 20, 50)),
    });
    return rows.map(toCustomerDto);
  }

  /** How many of the customer's notices are still unread (drives the bell pill). */
  async function countUnreadForCustomer(customerUserId: string): Promise<number> {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true },
    });
    if (!customer) return 0;
    return prisma.customerNotification.count({
      where: { customerId: customer.id, readAt: null },
    });
  }

  /**
   * Acknowledges one notice as read, scoped to the caller's own profile.
   * Idempotent: acknowledging an already-read notice is still a 204. Emits the
   * fresh unread count so the pill reconciles even when nothing changed.
   */
  async function markCustomerNotificationRead(
    customerUserId: string,
    notificationId: string,
  ): Promise<void> {
    const updated = await prisma.customerNotification.updateMany({
      where: { id: notificationId, customer: { userId: customerUserId } },
      data: { readAt: new Date() },
    });
    await emitUnreadForCustomer(customerUserId);
    if (updated.count === 0) {
      // Not theirs or it no longer exists; a 404 avoids leaking what exists.
      throw notFound('That notification could not be found.');
    }
  }

  /**
   * Marks every one of the caller's unread notices as read at once. The
   * customer's inbox calls this when they leave it, so every notice is
   * acknowledged in one request instead of row by row; the bell pill then
   * reads zero.
   */
  async function markAllCustomerNotificationsRead(customerUserId: string): Promise<void> {
    await prisma.customerNotification.updateMany({
      where: { customer: { userId: customerUserId }, readAt: null },
      data: { readAt: new Date() },
    });
    await emitUnreadForCustomer(customerUserId);
  }

  /**
   * Permanently removes one of the caller's notices.
   *
   * The row is scoped to the caller's own profile in the query, so a path id
   * belonging to someone else can never be touched; a missing row (or one that
   * is not theirs) is a 404 instead of a silent success, without leaking which
   * ids exist. The bell pill is re-emitted because deleting an unread notice
   * moves the count.
   */
  async function deleteCustomerNotification(
    customerUserId: string,
    notificationId: string,
  ): Promise<void> {
    const deleted = await prisma.customerNotification.deleteMany({
      where: { id: notificationId, customer: { userId: customerUserId } },
    });
    await emitUnreadForCustomer(customerUserId);
    if (deleted.count === 0) {
      throw notFound('That notification could not be found.');
    }
  }

  /** Recomputes the customer's unread count and pushes it over their socket. */
  async function emitUnreadForCustomer(customerUserId: string): Promise<void> {
    const unreadCount = await countUnreadForCustomer(customerUserId);
    deps.realtime?.emitToUser(customerUserId, REALTIME_EVENTS.NOTIFICATION_UNREAD, {
      unreadCount,
    });
  }

  /**
   * Registers (or replaces) this user's device push token on the surface that
   * is registering, recording which provider owns it.
   *
   * Works for a Pro or a Customer. `appType` decides which row holds the token
   * — it comes from the caller's `X-App-Type`, never from which profiles exist.
   * That matters because one account can be both a pro and a customer (a single
   * phone number provisions both rows under the same `userId`): each phone's
   * token must land on the row that phone is, or pushes between two phones of
   * the same person would all ring the wrong device.
   */
  async function registerPushToken(
    userId: string,
    appType: AppType | null,
    pushToken: string,
    platform: PushPlatformInput,
    provider: PushProviderInput,
    deviceId?: string | null,
  ): Promise<void> {
    const startedAt = Date.now();
    logger.info(`[Push] Token registration request received for user ${userId} (${provider})`);

    // Validate the token shape: Expo tokens must look like Expo push tokens,
    // FCM tokens are opaque but must not smuggle an Expo-shaped value in as an
    // FCM registration. Both stay length-bound (see the validation schema).
    const providerValue: 'EXPO' | 'FCM' = provider === 'fcm' ? 'FCM' : 'EXPO';
    if (providerValue === 'EXPO') {
      const client = await getExpoClient();
      const isValid =
        client?.isExpoPushToken?.(pushToken) ??
        /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9._-]+\]$/.test(pushToken);
      if (!isValid) {
        logger.warn(`[Push] Rejected invalid Expo push token shape from user ${userId}.`);
        throw badRequest('That is not a valid device push token.');
      }
    } else {
      const looksLikeExpo = /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(pushToken);
      if (looksLikeExpo) {
        logger.warn(`[Push] Rejected an Expo-shaped token registered as FCM from user ${userId}.`);
        throw badRequest('That token does not match the registered push provider.');
      }
    }

    const storedPlatform = platform === 'android' ? 'ANDROID' : 'IOS';

    // The surface the calling app is on. Null (missing `X-App-Type`, e.g. an
    // admin client) defaults to the pro surface, matching `roleForAppType`.
    const onCustomer = appType === 'customer';

    const profileId = await prisma
      .$transaction(
        async (tx) => {
          // A device token identifies one device; a re-sign-in, re-install or a
          // deleted-then-re-registered account must not leave a stale copy on another
          // row behind (violating the unique index). A pro surface is always linked
          // (`ProProfile.userId` is non-null), so `not` alone is enough there.
          await tx.proProfile.updateMany({
            where: { pushToken, userId: { not: userId } },
            data: { pushToken: null, pushPlatform: null, pushProvider: null },
          });
          // A finalized customer surface keeps its row with `userId` unlinked, and SQL
          // `user_id <> $x` is UNKNOWN — not true — for a NULL, so `not` alone would
          // skip it. That skipped token still occupies the unique `push_token` index,
          // so the upsert below would fail forever with a unique violation. The OR's
          // first branch clears those orphans.
          await tx.customerProfile.updateMany({
            where: { pushToken, OR: [{ userId: null }, { userId: { not: userId } }] },
            data: { pushToken: null, pushPlatform: null, pushProvider: null },
          });

          if (onCustomer) {
            const row = await tx.customerProfile.upsert({
              where: { userId },
              create: {
                userId,
                pushToken,
                pushPlatform: storedPlatform,
                pushProvider: providerValue,
              },
              update: {
                pushToken,
                pushPlatform: storedPlatform,
                pushProvider: providerValue,
              },
            });
            // Self-heal: the same token must never also sit on this account's pro
            // surface (a buggy/legacy registration can leave it there), or a push
            // meant for one phone would split across the two rows of one person.
            await tx.proProfile.updateMany({
              where: { userId, pushToken },
              data: { pushToken: null, pushPlatform: null, pushProvider: null },
            });
            await tx.proPushDevice.deleteMany({ where: { pushToken } });
            return row.id;
          }

          // Pro path: the Pro profile owns job alerts, plus the device binding that
          // lets the native overlay operate on a dead process.
          if (deviceId) {
            await tx.proProfile.updateMany({
              where: { pushDeviceId: deviceId, userId: { not: userId } },
              data: { pushToken: null, pushPlatform: null, pushProvider: null, pushDeviceId: null },
            });
          }
          const pro = await tx.proProfile.upsert({
            where: { userId },
            create: {
              userId,
              pushToken,
              pushPlatform: storedPlatform,
              pushProvider: providerValue,
              pushDeviceId: deviceId ?? null,
            },
            update: {
              pushToken,
              pushPlatform: storedPlatform,
              pushProvider: providerValue,
              pushDeviceId: deviceId ?? null,
            },
          });
          // See the customer branch above — drop any duplicate of this token that a
          // legacy registration left on the same account's customer surface.
          await tx.customerProfile.updateMany({
            where: { userId, pushToken },
            data: { pushToken: null, pushPlatform: null, pushProvider: null },
          });
          const installId = deviceId || `legacy:${pro.id}`;
          // Adopt any migrated/legacy copy of this token without disturbing other devices.
          await tx.proPushDevice.deleteMany({ where: { pushToken, deviceId: { not: installId } } });
          const registration = {
            proId: pro.id,
            pushToken,
            pushPlatform: storedPlatform,
            pushProvider: providerValue,
          } as const;
          await tx.proPushDevice.upsert({
            where: { deviceId: installId },
            create: { ...registration, deviceId: installId },
            update: registration,
          });
          return pro.id;
        },
        {
          // Several sequential ownership/legacy cleanup queries share this
          // transaction. The default 5 s expires on a slow remote connection.
          maxWait: 5000,
          timeout: 15000,
        },
      )
      .catch((error: unknown) =>
        tokenStorageFailure(error, {
          operation: 'register',
          surface: onCustomer ? 'customer' : 'pro',
          elapsedMs: Date.now() - startedAt,
        }),
      );
    // A successful callback can still fail during COMMIT. Only report a
    // registered token after the transaction has actually committed.
    logger.info(
      onCustomer
        ? `[Push] Registered customer ${profileId}, token=${pushTokenId(pushToken)}, provider=${providerValue}.`
        : `[Push] Registered pro ${userId}, device=${pushTokenId(deviceId || `legacy:${profileId}`)}, token=${pushTokenId(pushToken)}, provider=${providerValue}.`,
    );
  }

  /** Unregisters only the authenticated caller's current installation/token. */
  async function unregisterPushToken(
    userId: string,
    appType: AppType | null,
    input: { deviceId?: string; pushToken?: string },
  ): Promise<void> {
    // Also enforce this when invoked outside the validated HTTP route.
    if (!input.deviceId && !input.pushToken)
      throw badRequest('A device or push token is required.');
    if (appType === 'customer') {
      if (!input.pushToken) throw badRequest('A push token is required.');
      await prisma.customerProfile
        .updateMany({
          where: { userId, pushToken: input.pushToken },
          data: { pushToken: null, pushPlatform: null, pushProvider: null },
        })
        .catch(tokenStorageFailure);
    } else {
      await prisma
        .$transaction(async (tx) => {
          await tx.proPushDevice.deleteMany({
            where: {
              pro: { userId },
              ...(input.deviceId ? { deviceId: input.deviceId } : { pushToken: input.pushToken! }),
            },
          });
          await tx.proProfile.updateMany({
            where: {
              userId,
              ...(input.deviceId
                ? { pushDeviceId: input.deviceId }
                : { pushToken: input.pushToken! }),
            },
            data: { pushToken: null, pushPlatform: null, pushProvider: null, pushDeviceId: null },
          });
        })
        .catch(tokenStorageFailure);
    }
    logger.info(
      `[Push] Unregistered user ${userId}, registration=${pushTokenId(input.deviceId ?? input.pushToken!)}.`,
    );
  }

  /**
   * Delivers a chat-message push to the recipient (the other party of a job),
   * so they get a tray notification when the thread isn't open on their device.
   *
   * The recipient is looked up by Profile id across both surfaces — customer or
   * pro — and sent over the provider their token was registered with (FCM for
   * Android, Expo otherwise).
   *
   * Unlike a job alert, a chat message is a DISPLAY notification on Android:
   * FCM renders it in the system tray even when the app process is dead, which
   * is exactly what a conversation notification should do. The `type` is
   * `CHAT_MESSAGE`, which the native Android job-alert service passes straight
   * through to Expo's handler (it only intercepts NEW_JOB / terminal kinds), so
   * this deep-links into the chat screen on tap.
   */
  async function sendChatPush(input: {
    userId: string;
    jobId: string;
    senderName: string | null;
    message: ChatMessage;
    /** Which side of the job the recipient is on — the row their token lives on. */
    recipientIsCustomer: boolean;
  }): Promise<void> {
    // Chat is between the two sides of one job, so delivery reads the token of
    // the surface the recipient acts as there. When one person is both (one
    // phone number on two devices) their tokens live on the two separate rows;
    // picking "whichever exists" would ring the wrong phone.
    const profile = await (input.recipientIsCustomer
      ? prisma.customerProfile.findUnique({
          where: { userId: input.userId },
          select: { pushToken: true, pushPlatform: true, pushProvider: true },
        })
      : prisma.proProfile.findUnique({
          where: { userId: input.userId },
          select: {
            pushToken: true,
            pushPlatform: true,
            pushProvider: true,
            pushDevices: { select: pushDeviceSelect },
          },
        }));
    if (!profile) return;
    const targets = pushTargetsOf(profile);

    const title = input.senderName ?? 'New message';
    const body = input.message.content;
    const data = toFcmData({
      type: 'CHAT_MESSAGE',
      jobId: input.jobId,
      messageId: input.message.id,
      senderId: input.message.senderId,
    });
    // Delivered on the chat channel both apps create. "v2" is intentional:
    // Android does not let an app change a channel's sound after it's created,
    // and the original `chat_messages` channel was created silent, so the id is
    // bumped (with the apps) to a channel that uses the device default sound.
    const channelId = 'chat_messages_v2';

    await Promise.all(
      targets.map(async (target) => {
        const token = target.pushToken;
        if (target.pushProvider === 'FCM') {
          const client = getFcmClient();
          if (!client) {
            logger.warn('[Push] FCM not configured — skipping a chat push.');
            return;
          }
          // A display message (with a `notification` block) survives the process
          // being dead, unlike a data-only message. collapseKey keys the thread so
          // a burst of messages replaces rather than stacks.
          const result = await sendFcm(token, {
            notification: { title, body },
            data: { ...data, title, body },
            android: {
              priority: 'high',
              collapseKey: `chat-${input.jobId}`,
              notification: { channelId, sound: 'default' },
            },
          });
          if (!result.ok) {
            logger.warn(`[Push] Chat push to ${input.userId} on job ${input.jobId} not delivered.`);
          }
          return;
        }

        const result = await sendPush(token, { title, body, data }, target.pushPlatform, 'EXPO');
        if (!result.ok) {
          logger.warn(`[Push] Chat push to ${input.userId} on job ${input.jobId} not delivered.`);
        }
      }),
    );
  }
  /**
   * One-off push to a customer's device — used to surface the start-work OTP.
   *
   * Reads the token from the customer's own profile row (never guessing which
   * surface "whichever exists" of a shared phone number owns it) and sends a
   * DISPLAY message, so it shows in the tray even when the Customer app is
   * backgrounded or killed. Delivery is type-aware: the start-work OTP raises on
   * the dedicated `job_otp` channel with per-job collapse so the code replaces
   * a stale one, while booking-status updates (accepted / on the way / arrived /
   * started / complete / paid / expired) raise on the `job_updates` channel so
   * each stage surfaces individually. A customer with no registered token simply
   * skips delivery — nothing sent ever fails the job.
   */
  async function sendCustomerPush(input: {
    userId: string;
    jobId: string;
    title: string;
    body: string;
    /** Which client behavior the push maps to (drives the tray channel + data type). */
    type?: CustomerPushType;
  }): Promise<void> {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId: input.userId },
      select: { pushToken: true, pushPlatform: true, pushProvider: true },
    });
    const token = profile?.pushToken;
    if (!token) {
      logger.info(
        `[Push] No customer push token for user ${input.userId} on job ${input.jobId} — skipping the push.`,
      );
      return;
    }

    const type = input.type ?? 'JOB_OTP';
    const channelId = type === 'JOB_OTP' ? 'job_otp' : CUSTOMER_STATUS_CHANNEL;
    const data = toFcmData({ type, jobId: input.jobId });

    if (pushProviderOf(profile as { pushProvider?: 'EXPO' | 'FCM' | null }) === 'FCM') {
      const client = getFcmClient();
      if (!client) {
        logger.warn(`[Push] FCM not configured — skipping a customer push (${type}).`);
        return;
      }
      const result = await sendFcm(token, {
        notification: { title: input.title, body: input.body },
        data: { ...data, title: input.title, body: input.body },
        android: {
          priority: 'high',
          collapseKey: type === 'JOB_OTP' ? `otp-${input.jobId}` : undefined,
          notification: { channelId, sound: 'default' },
        },
      });
      if (!result.ok) {
        logger.warn(
          `[Push] Customer ${type} push to ${input.userId} on job ${input.jobId} not delivered.`,
        );
      }
      return;
    }

    const result = await sendPush(
      token,
      { title: input.title, body: input.body, data },
      profile.pushPlatform,
      'EXPO',
    );
    if (!result.ok) {
      logger.warn(
        `[Push] Customer ${type} push to ${input.userId} on job ${input.jobId} not delivered.`,
      );
    }
  }

  /** Turns the Pro's job alerts on or off. */
  async function setPushSettings(
    userId: string,
    jobAlertsEnabled: boolean,
  ): Promise<{ jobAlertsEnabled: boolean }> {
    await prisma.proProfile.update({
      where: { userId },
      data: { jobAlertsEnabled },
    });
    return { jobAlertsEnabled };
  }

  /**
   * Send a push notification for marketing campaigns
   */
  async function sendCampaignNotification(input: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    platform?: PushTargetPlatform;
    provider?: PushTargetProvider;
  }): Promise<{ ok: boolean; providerRef?: string; error?: string }> {
    const platform = input.platform || 'ANDROID';
    const provider = input.provider || (platform === 'IOS' ? 'EXPO' : null);
    const result = await sendPush(
      input.token,
      {
        title: input.title,
        body: input.body,
        data: input.data || { type: 'CAMPAIGN' },
        channelId: 'campaigns',
      },
      platform,
      provider,
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // Repeating job-alert scheduler
  // -------------------------------------------------------------------------

  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * One scheduler tick: re-page every still-open job alert, while the job is
   * still waiting for a pro and the pro still wants it. Stops paging a pro who
   * went offline, disabled alerts, or has no token.
   */
  async function tick(): Promise<void> {
    try {
      // Unresolved job-alert rows group the page fan-out by job. We page only
      // pros who are still online, still want alerts, and still have a token.
      const waiting = await prisma.notification.findMany({
        where: {
          kind: NotificationKind.JOB_ALERT,
          resolvedAt: null,
          // A pro who asked to delete (or already deleted) is never paged:
          // pending deletion means no new work, completed deletion means the
          // tombstone has no push token with meaning.
          pro: {
            isOnline: true,
            jobAlertsEnabled: true,
            OR: [{ pushToken: { not: null } }, { pushDevices: { some: {} } }],
            deletedAt: null,
            deletionRequestedAt: null,
          },
        },
        select: {
          id: true,
          repeats: true,
          jobId: true,
          pro: {
            select: {
              id: true,
              pushToken: true,
              pushPlatform: true,
              pushProvider: true,
              pushDeviceId: true,
              pushDevices: { select: pushDeviceSelect },
              latitude: true,
              longitude: true,
            },
          },
          job: {
            select: {
              id: true,
              status: true,
              proId: true,
              createdAt: true,
              latitude: true,
              longitude: true,
              locationLabel: true,
              service: { select: { name: true } },
              skill: { select: { name: true } },
              customSkill: true,
              description: true,
              basePayPaise: true,
            },
          },
        },
      });

      for (const row of waiting) {
        const job = row.job;
        if (!job) {
          await prisma.notification.update({
            where: { id: row.id },
            data: { resolvedAt: new Date() },
          });
          continue;
        }
        // Keep paging only while the job is still open and unassigned.
        if (job.status !== JobStatus.REQUESTED || job.proId !== null) {
          await prisma.notification.update({
            where: { id: row.id },
            data: { resolvedAt: new Date() },
          });
          continue;
        }
        // Enforce the ceiling so a stale job cannot page a pro forever.
        if (row.repeats >= config.jobAlertMaxRepeats) {
          await prisma.notification.update({
            where: { id: row.id },
            data: { resolvedAt: new Date() },
          });
          continue;
        }
        const targets = pushTargetsOf(row.pro);
        if (targets.length === 0) continue;

        const distanceMeters =
          row.pro.latitude !== null &&
          row.pro.longitude !== null &&
          job.latitude !== null &&
          job.longitude !== null
            ? distanceKm(
                { latitude: row.pro.latitude, longitude: row.pro.longitude },
                { latitude: job.latitude, longitude: job.longitude },
              )
            : null;

        await alertOne(
          row.pro.id,
          {
            jobId: job.id,
            serviceName: job.service.name,
            serviceCategory: job.customSkill?.trim() || job.skill.name,
            customSkill: job.customSkill,
            description: job.description,
            basePayPaise: job.basePayPaise,
            address: job.locationLabel,
            expiresAt: new Date(job.createdAt.getTime() + config.jobExpireTtlMs).toISOString(),
            professionalId: row.pro.id,
            distanceKm: distanceMeters,
          },
          targets,
          true,
        );
      }
    } catch (error) {
      // Never let a scheduler error kill the process; log and continue.
      logger.error('Job-alert scheduler tick failed.', error);
    }
  }

  /** Starts the repeating scheduler. Safe to call once. */
  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void tick();
    }, config.jobAlertRepeatMs);
    // Ensure intervals do not keep the process alive on shutdown.
    timer.unref?.();
  }

  /** Stops the repeating scheduler. */
  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    alertEligiblePros,
    reAlertEligiblePros,
    resolveJobAlerts,
    sendAssignedCancellationProPush,
    listForPro,
    recordCustomerNotification,
    listForCustomer,
    countUnreadForCustomer,
    markCustomerNotificationRead,
    markAllCustomerNotificationsRead,
    deleteCustomerNotification,
    registerPushToken,
    unregisterPushToken,
    setPushSettings,
    sendChatPush,
    sendCustomerPush,
    sendCampaignNotification,
    start,
    stop,
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;

/**
 * The subset of the notifications service the messages domain injects as a
 * dependency, avoiding a tight import coupling while giving the messages
 * service access to push delivery.
 */
export type ChatPushSender = NotificationsService['sendChatPush'];

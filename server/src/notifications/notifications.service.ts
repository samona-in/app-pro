import {
  JobStatus,
  NotificationKind,
  type AppNotification,
} from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import type { AppConfig } from '../config';
import { logger } from '../common/logger';

/**
 * Notifications domain service.
 *
 * Owns push delivery for professionals: registering a device token, persisting
 * the Pro's own job-alert preference, and delivering — on a repeating cadence —
 * the "new job" alert that breaks through a locked phone, a pocket or sleep
 * (the tawk.to-style repeating alert).
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
}

/** The shape the jobs domain hands over when a job opens for a list of pros. */
export interface JobAlertRecipient {
  /** pro_profiles.id — the join key to a `Notification` row. */
  proId: string;
}

export interface JobAlertInfo {
  jobId: string;
  /** Display name of the requested service. */
  serviceName: string;
  /** The free-text category when the skill is "other". */
  customSkill: string | null;
  /** Short description of the requested work. */
  description: string;
  /** Guaranteed amount, in paise. */
  basePayPaise: number;
}

const ROUTE_PREFIX = 'samonapro://job/';

function notificationRoute(jobId: string): string {
  return `${ROUTE_PREFIX}${jobId}`;
}

/** Format an amount in paise as ₹ with two decimals, e.g. ₹450.00. */
function formatPay(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** The push body for a job alert, shared by the first send and every repeat. */
function jobAlertTitle(info: JobAlertInfo): string {
  return `${info.customSkill ?? info.serviceName} job nearby`;
}

function jobAlertBody(info: JobAlertInfo): string {
  return `${info.description} — ${formatPay(info.basePayPaise)}. Tap to see and accept.`;
}

/** A persisted notification row, mapped to the client DTO. */
type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
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
    route: row.route,
    delivered: row.delivered,
    repeats: row.repeats,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
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

  let expoClientPromise: Promise<{ sendPushNotificationsAsync(msgs: unknown[]): Promise<unknown[]> } | null> | null =
    null;

  async function getExpoClient() {
    if (!config.expoAccessToken) return null;
    if (!expoClientPromise) {
      expoClientPromise = import('expo-server-sdk')
        .then((mod) => {
          const Expo = (mod as { default?: { new (o: unknown): unknown }; Expo?: { new (o: unknown): unknown } }).Expo
            ?? (mod as { default?: { new (o: unknown): unknown }; Expo?: { new (o: unknown): unknown } }).default;
          if (!Expo) throw new Error('expo-server-sdk did not expose an Expo client.');
          return new Expo({ accessToken: config.expoAccessToken }) as unknown as {
            sendPushNotificationsAsync(msgs: unknown[]): Promise<unknown[]>;
          };
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

  /** One-off push to a single token. Returns whether Expo accepted it. */
  async function sendPush(
    pushToken: string,
    message: {
      title: string;
      body: string;
      data: Record<string, unknown>;
      channelId?: string;
    },
  ): Promise<{ ok: boolean; providerRef?: string; error?: string }> {
    const client = await getExpoClient();
    if (!client) {
      // Local dev without a token: record but do not fail the request.
      return { ok: false };
    }

    try {
      const tickets = await client.sendPushNotificationsAsync([
        {
          to: pushToken,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          priority: 'high',
          // Android needs an existing channel to raise this as a full alert.
          channelId: message.channelId ?? 'job-alerts',
          // iOS: allow this to break through "do not disturb"-tier noise.
          interruptionLevel: 'time-sensitive',
        },
      ]);
      const ticket = tickets?.[0] as
        | { status: string; id?: string; message?: string }
        | undefined;
      if (ticket?.status === 'ok') {
        return { ok: true, providerRef: ticket.id };
      }
      return { ok: false, error: ticket?.message ?? 'Push rejected by Expo.' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Push failed.' };
    }
  }

  /** Writes (or re-arms) one pro's job-alert row and delivers the push. */
  async function alertOne(
    proId: string,
    info: JobAlertInfo,
    token: string,
    isRepeat: boolean,
  ): Promise<void> {
    const result = await sendPush(token, {
      title: jobAlertTitle(info),
      body: jobAlertBody(info),
      data: { jobId: info.jobId, kind: NotificationKind.JOB_ALERT },
      channelId: 'job-alerts',
    });

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
        route: notificationRoute(info.jobId),
        delivered: result.ok,
        providerRef: result.providerRef,
        repeats: isRepeat ? 1 : 0,
      },
      update: isRepeat
        ? {
            delivered: result.ok,
            ...(result.providerRef ? { providerRef: result.providerRef } : {}),
            repeats: { increment: 1 },
          }
        : {},
    });
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
    info: JobAlertInfo,
  ): Promise<void> {
    if (recipients.length === 0) return;

    const pros = await prisma.proProfile.findMany({
      where: { id: { in: recipients.map((r) => r.proId) } },
      select: { id: true, pushToken: true, jobAlertsEnabled: true },
    });

    await Promise.all(
      pros.map(async (pro) => {
        // Skip anyone who turned alerts off or has no token yet.
        if (!pro.jobAlertsEnabled || !pro.pushToken) return;
        await alertOne(pro.id, info, pro.pushToken, false);
      }),
    );
  }

  /**
   * Stops every open job-alert row for a job.
   *
   * Called when a job leaves the open pool (accepted, expired, cancelled). The
   * row stays for history; `resolvedAt` just stops the scheduler from paging
   * again.
   */
  async function resolveJobAlerts(jobId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { jobId, kind: NotificationKind.JOB_ALERT, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
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

  /** Registers (or replaces) this Pro's device push token. */
  async function registerPushToken(userId: string, pushToken: string): Promise<void> {
    // A device token identifies one device; a re-sign-in or re-install must not
    // leave a stale copy on an old profile behind (violating the unique index).
    await prisma.proProfile.updateMany({
      where: { pushToken, userId: { not: userId } },
      data: { pushToken: null },
    });

    await prisma.proProfile.upsert({
      where: { userId },
      create: { userId, pushToken },
      update: { pushToken },
      select: { id: true },
    });
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
          pro: { isOnline: true, jobAlertsEnabled: true, pushToken: { not: null } },
        },
        select: {
          id: true,
          repeats: true,
          jobId: true,
          pro: { select: { id: true, pushToken: true } },
          job: {
            select: {
              id: true,
              status: true,
              proId: true,
              service: { select: { name: true } },
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
          await prisma.notification.update({ where: { id: row.id }, data: { resolvedAt: new Date() } });
          continue;
        }
        // Keep paging only while the job is still open and unassigned.
        if (job.status !== JobStatus.REQUESTED || job.proId !== null) {
          await prisma.notification.update({ where: { id: row.id }, data: { resolvedAt: new Date() } });
          continue;
        }
        // Enforce the ceiling so a stale job cannot page a pro forever.
        if (row.repeats >= config.jobAlertMaxRepeats) {
          await prisma.notification.update({ where: { id: row.id }, data: { resolvedAt: new Date() } });
          continue;
        }
        const token = row.pro.pushToken;
        if (!token) continue;

        await alertOne(row.pro.id, {
          jobId: job.id,
          serviceName: job.service.name,
          customSkill: job.customSkill,
          description: job.description,
          basePayPaise: job.basePayPaise,
        }, token, true);
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
    resolveJobAlerts,
    listForPro,
    registerPushToken,
    setPushSettings,
    start,
    stop,
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;

import type { AppConfig } from '../config';
import type { PrismaClient } from '../database/prisma';
import { logger } from '../common/logger';
import {
  normaliseStatus,
  parseEventPayload,
  twilioVerifyEventSchema,
  type OtpDeliveryStatus,
  type TwilioVerifyEvent,
} from './events';
import { hashPhone, phoneLast2 } from './privacy';

export interface RegisterOtpAttemptInput {
  phone: string;
  app: 'CUSTOMER' | 'PRO';
  clientAttemptId: string;
  device?: {
    manufacturer?: string;
    model?: string;
    osVersion?: string;
  };
}

export interface RecordOtpEventsResult {
  received: number;
  stored: number;
  duplicates: number;
  ignored: number;
}

export interface OtpTelemetryService {
  /** False when the feature is off; routes then refuse rather than half-work. */
  readonly enabled: boolean;
  registerAttempt(input: RegisterOtpAttemptInput): Promise<{ attemptId: string } | null>;
  recordEvents(rawBody: string): Promise<RecordOtpEventsResult>;
}

/**
 * How far before a code request a callback may still belong to it.
 *
 * Twilio usually reports SENT within seconds, but the app's registration call
 * is fire-and-forget: it can land after the first callback on a slow network.
 * Ninety seconds covers that race without sweeping in the previous attempt,
 * which the resend UI spaces at least 30 seconds apart.
 */
const PRE_REGISTRATION_GRACE_MS = 90_000;

interface AttemptForLink {
  id: string;
  app: 'CUSTOMER' | 'PRO';
  requestedAt: Date;
  verificationSid: string | null;
  attemptSid: string | null;
  lastEventAt: Date | null;
}

/**
 * Phone-OTP delivery telemetry.
 *
 * Owns two writes:
 *   * an app's "I just requested a code" registration, so a later Twilio event
 *     can be attributed to a surface and a device;
 *   * Twilio's Message Status Stream callbacks, stored idempotently and folded
 *     into the attempt's latest status.
 *
 * Correlation is by HMAC-hashed phone + request time: Supabase Auth does not
 * expose the Twilio Verification SID to the client, so there is no SID to carry
 * from `signInWithOtp`. When no attempt matches, the event is still stored — a
 * missing attempt row is itself diagnostic (registration failed or telemetry
 * was deployed after the request).
 */
export function createOtpTelemetryService(deps: {
  prisma: PrismaClient;
  config: AppConfig;
}): OtpTelemetryService {
  const { prisma } = deps;
  const settings = deps.config.otpTelemetry;
  const secret = settings.phoneHashSecret;

  function isEnabled(): boolean {
    return settings.enabled && secret !== null;
  }

  /** Folds the newest event for an attempt into its row. */
  async function applyEventToAttempt(
    attempt: AttemptForLink,
    event: {
      status: OtpDeliveryStatus;
      eventTime: Date;
      verificationSid: string | null;
      attemptSid: string | null;
    },
  ): Promise<void> {
    // Out-of-order callbacks are normal on Event Streams. Never move an
    // attempt backwards from DELIVERED to SENT because a stale event arrived.
    if (attempt.lastEventAt && event.eventTime < attempt.lastEventAt) return;

    await prisma.otpAttempt.update({
      where: { id: attempt.id },
      data: {
        status: event.status,
        lastEventAt: event.eventTime,
        verificationSid: attempt.verificationSid ?? event.verificationSid,
        attemptSid: attempt.attemptSid ?? event.attemptSid,
      },
    });
  }

  /**
   * Attaches callbacks that arrived before their registration.
   *
   * Event Streams can deliver the SENT event before the app's fire-and-forget
   * registration reaches the API, especially on a slow mobile uplink.
   */
  async function linkEarlyEvents(attempt: AttemptForLink, phoneHash: string): Promise<void> {
    const windowMs = Math.min(settings.correlationWindowMs, PRE_REGISTRATION_GRACE_MS);
    const early = await prisma.otpDeliveryEvent.findMany({
      where: {
        phoneHash,
        otpAttemptId: null,
        eventTime: {
          gte: new Date(attempt.requestedAt.getTime() - windowMs),
          lte: new Date(attempt.requestedAt.getTime() + windowMs),
        },
      },
      orderBy: { eventTime: 'desc' },
      take: 5,
    });

    for (const event of early) {
      await prisma.otpDeliveryEvent.update({
        where: { id: event.id },
        data: { otpAttemptId: attempt.id },
      });
    }

    const newest = early[0];
    if (!newest) return;

    await applyEventToAttempt(attempt, {
      status: newest.status as OtpDeliveryStatus,
      eventTime: newest.eventTime,
      verificationSid: newest.verificationSid,
      attemptSid: newest.attemptSid,
    });
  }

  async function registerAttempt(
    input: RegisterOtpAttemptInput,
  ): Promise<{ attemptId: string } | null> {
    if (!isEnabled() || secret === null) return null;

    const phoneHash = hashPhone(input.phone, secret);
    const attempt = await prisma.otpAttempt.upsert({
      where: { clientAttemptId: input.clientAttemptId },
      // A retry is not a new request: never move the number, app or device
      // fields of an existing row.
      update: {},
      create: {
        clientAttemptId: input.clientAttemptId,
        phoneHash,
        phoneLast2: phoneLast2(input.phone),
        app: input.app,
        deviceManufacturer: input.device?.manufacturer ?? null,
        deviceModel: input.device?.model ?? null,
        osVersion: input.device?.osVersion ?? null,
      },
      select: {
        id: true,
        app: true,
        requestedAt: true,
        verificationSid: true,
        attemptSid: true,
        lastEventAt: true,
      },
    });

    await linkEarlyEvents(attempt, phoneHash);

    logger.info('OTP attempt registered.', {
      attemptId: attempt.id,
      app: attempt.app,
      device: input.device?.model ?? null,
      manufacturer: input.device?.manufacturer ?? null,
    });

    return { attemptId: attempt.id };
  }

  async function correlate(
    phoneHash: string,
    eventTime: Date,
    verificationSid: string | null,
  ): Promise<AttemptForLink | null> {
    const candidates = await prisma.otpAttempt.findMany({
      where: {
        phoneHash,
        requestedAt: {
          gte: new Date(eventTime.getTime() - settings.correlationWindowMs),
          lte: new Date(eventTime.getTime() + PRE_REGISTRATION_GRACE_MS),
        },
      },
      orderBy: { requestedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        app: true,
        requestedAt: true,
        verificationSid: true,
        attemptSid: true,
        lastEventAt: true,
      },
    });

    const compatible = candidates.filter(
      (attempt) =>
        !verificationSid || !attempt.verificationSid || attempt.verificationSid === verificationSid,
    );
    const pool = compatible.length > 0 ? compatible : candidates;

    // Nearest in time wins. A resend creates a second attempt for the same
    // number, and the callback belongs to whichever request it followed.
    let best: AttemptForLink | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of pool) {
      const distance = Math.abs(candidate.requestedAt.getTime() - eventTime.getTime());
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  async function storeEvent(event: TwilioVerifyEvent): Promise<'stored' | 'duplicate' | 'ignored'> {
    if (secret === null) return 'ignored';

    const status = normaliseStatus(event.data.message_status, event.type);
    if (!status) return 'ignored';

    const eventTime = event.time ? new Date(event.time) : new Date();
    const when = Number.isNaN(eventTime.getTime()) ? new Date() : eventTime;

    const phoneHash = hashPhone(event.data.to, secret);
    const verificationSid = event.data.verification_sid ?? null;
    const attemptSid = event.data.attempt_sid ?? null;

    const attempt = await correlate(phoneHash, when, verificationSid);

    try {
      await prisma.otpDeliveryEvent.create({
        data: {
          eventId: event.id,
          eventType: event.type,
          verificationSid,
          attemptSid,
          phoneHash,
          phoneLast2: phoneLast2(event.data.to),
          channel: event.data.channel ?? null,
          status,
          mcc: event.data.mcc === undefined ? null : String(event.data.mcc),
          mnc: event.data.mnc === undefined ? null : String(event.data.mnc),
          numberSegments: event.data.number_segments ?? null,
          eventTime: when,
          otpAttemptId: attempt?.id ?? null,
        },
      });
    } catch (error) {
      // Twilio retries until acknowledged, so duplicates are expected and are
      // not an error. Any other failure must surface to the caller so Twilio
      // retries; swallowing it would lose the delivery evidence silently.
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw error;
    }

    if (attempt)
      await applyEventToAttempt(attempt, { status, eventTime: when, verificationSid, attemptSid });

    if (status === 'UNDELIVERED' || status === 'FAILED') {
      // Carrier and handset failures are what this feature exists to explain.
      // MCC/MNC identify the destination network; no phone number is logged.
      logger.warn('OTP delivery failed.', {
        eventType: event.type,
        status,
        mcc: event.data.mcc ?? null,
        mnc: event.data.mnc ?? null,
        attemptSid,
        verificationSid,
        attemptId: attempt?.id ?? null,
        app: attempt?.app ?? null,
      });
    }

    return 'stored';
  }

  async function recordEvents(rawBody: string): Promise<RecordOtpEventsResult> {
    const result: RecordOtpEventsResult = {
      received: 0,
      stored: 0,
      duplicates: 0,
      ignored: 0,
    };

    for (const candidate of parseEventPayload(rawBody)) {
      result.received += 1;
      const parsed = twilioVerifyEventSchema.safeParse(candidate);
      if (!parsed.success) {
        result.ignored += 1;
        continue;
      }

      const outcome = await storeEvent(parsed.data);
      if (outcome === 'stored') result.stored += 1;
      else if (outcome === 'duplicate') result.duplicates += 1;
      else result.ignored += 1;
    }

    logger.info('OTP status callback processed.', result);
    return result;
  }

  return { enabled: isEnabled(), registerAttempt, recordEvents };
}

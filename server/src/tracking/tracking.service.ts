import type { PrismaClient } from '../database/prisma';
import type { RealtimeService } from '../realtime/gateway';
import { REALTIME_EVENTS } from '../realtime/gateway';
import { forbidden, notFound } from '../common/errors';
import { logger } from '../common/logger';

export interface TrackingServiceDeps {
  prisma: PrismaClient;
  realtime: RealtimeService;
}

export function createTrackingService({ prisma, realtime }: TrackingServiceDeps) {
  const STALE_THRESHOLD_SECONDS = 30;
  const FRESH_THRESHOLD_SECONDS = 15;

  async function verifyBookingAccess(jobId: string, userId: string, requirePro = false) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: { select: { userId: true } },
        pro: { select: { userId: true } },
      },
    });
    if (!job) throw notFound('Booking not found.');
    const isCustomer = job.customer.userId === userId;
    const isPro = job.pro?.userId === userId;
    if (requirePro && !isPro) throw forbidden('Not authorized.');
    if (!requirePro && !isCustomer && !isPro) throw forbidden('Not authorized.');
    return job;
  }

  async function updateLocation(
    proUserId: string,
    data: {
      bookingId: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number | null;
      heading?: number | null;
      recordedAt?: string;
      sequence: number;
    },
  ) {
    const job = await verifyBookingAccess(data.bookingId, proUserId, true);
    if (!job.proId) throw forbidden('Job not assigned.');

    // Validate coordinates
    if (!isFinite(data.latitude) || !isFinite(data.longitude)) {
      throw new Error('Invalid coordinates.');
    }
    if (Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) {
      throw new Error('Invalid coordinates.');
    }

    const tracking = await prisma.jobTracking.upsert({
      where: { jobId: data.bookingId },
      create: {
        jobId: data.bookingId,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        speed: data.speed,
        heading: data.heading,
        sequence: data.sequence,
        lastLocationAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
        isAvailable: true,
        lastHeartbeatAt: new Date(),
      },
      update: {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        speed: data.speed,
        heading: data.heading,
        sequence: data.sequence,
        lastLocationAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
        isAvailable: true,
        lastError: null,
        lastHeartbeatAt: new Date(),
      },
    });

    const payload = {
      bookingId: data.bookingId,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy ?? null,
      speed: data.speed ?? null,
      heading: data.heading ?? null,
      sequence: data.sequence,
      recordedAt: tracking.lastLocationAt?.toISOString() ?? new Date().toISOString(),
    };

    // Notify customer
    if (job.customer.userId) {
      try {
        (realtime as any).emitToRoom?.(`booking:${data.bookingId}:tracking`, REALTIME_EVENTS.BOOKING_LOCATION_UPDATED, payload);
      } catch {}
      realtime.emitToUser(job.customer.userId, REALTIME_EVENTS.BOOKING_LOCATION_UPDATED, payload);
    }

    return payload;
  }

  async function setTrackingStatus(
    proUserId: string,
    data: { bookingId: string; status: 'available' | 'unavailable'; reason?: string },
  ) {
    const job = await verifyBookingAccess(data.bookingId, proUserId, true);

    const isAvailable = data.status === 'available';

    await prisma.jobTracking.upsert({
      where: { jobId: data.bookingId },
      create: {
        jobId: data.bookingId,
        isAvailable,
        lastError: data.reason,
        lastHeartbeatAt: new Date(),
      },
      update: {
        isAvailable,
        lastError: data.reason,
        lastHeartbeatAt: new Date(),
      },
    });

    if (job.customer.userId) {
      if (isAvailable) {
        try {
          (realtime as any).emitToRoom?.(`booking:${data.bookingId}:tracking`, REALTIME_EVENTS.BOOKING_TRACKING_RESTORED, {
            bookingId: data.bookingId,
            at: new Date().toISOString(),
          });
        } catch {}
        realtime.emitToUser(job.customer.userId, REALTIME_EVENTS.BOOKING_TRACKING_RESTORED, {
          bookingId: data.bookingId,
          at: new Date().toISOString(),
        });
      } else {
        try {
          (realtime as any).emitToRoom?.(`booking:${data.bookingId}:tracking`, REALTIME_EVENTS.BOOKING_TRACKING_UNAVAILABLE, {
            bookingId: data.bookingId,
            reason: data.reason,
            at: new Date().toISOString(),
          });
        } catch {}
        realtime.emitToUser(job.customer.userId, REALTIME_EVENTS.BOOKING_TRACKING_UNAVAILABLE, {
          bookingId: data.bookingId,
          reason: data.reason,
          at: new Date().toISOString(),
        });
      }
    }

    return { success: true };
  }

  async function getTrackingStatus(userId: string, bookingId: string) {
    const job = await verifyBookingAccess(bookingId, userId, false);
    const tracking = await prisma.jobTracking.findUnique({
      where: { jobId: bookingId },
    });

    if (!tracking) {
      return {
        bookingId,
        isAvailable: false,
        lastLocationAt: null,
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    const now = Date.now();
    const lastLoc = tracking.lastLocationAt ? tracking.lastLocationAt.getTime() : 0;
    const ageSeconds = lastLoc > 0 ? (now - lastLoc) / 1000 : Infinity;

    return {
      bookingId,
      isAvailable: tracking.isAvailable && ageSeconds < STALE_THRESHOLD_SECONDS,
      lastLocationAt: tracking.lastLocationAt?.toISOString() ?? null,
      lastUpdatedAt: tracking.lastUpdatedAt.toISOString(),
      lastError: tracking.lastError,
      ageSeconds: Math.round(ageSeconds),
      fresh: ageSeconds < FRESH_THRESHOLD_SECONDS,
    };
  }

  async function getLatestLocation(userId: string, bookingId: string) {
    const job = await verifyBookingAccess(bookingId, userId, false);
    const tracking = await prisma.jobTracking.findUnique({
      where: { jobId: bookingId },
    });

    if (!tracking || !tracking.latitude || !tracking.longitude) {
      return null;
    }

    const now = Date.now();
    const lastLoc = tracking.lastLocationAt ? tracking.lastLocationAt.getTime() : 0;
    const ageSeconds = lastLoc > 0 ? (now - lastLoc) / 1000 : Infinity;

    if (ageSeconds > STALE_THRESHOLD_SECONDS) {
      return {
        bookingId,
        latitude: tracking.latitude,
        longitude: tracking.longitude,
        accuracy: tracking.accuracy,
        speed: tracking.speed,
        heading: tracking.heading,
        sequence: tracking.sequence,
        recordedAt: tracking.lastLocationAt?.toISOString() ?? null,
        stale: true,
        isAvailable: false,
      };
    }

    return {
      bookingId,
      latitude: tracking.latitude,
      longitude: tracking.longitude,
      accuracy: tracking.accuracy,
      speed: tracking.speed,
      heading: tracking.heading,
      sequence: tracking.sequence,
      recordedAt: tracking.lastLocationAt?.toISOString() ?? null,
      stale: false,
      isAvailable: tracking.isAvailable,
    };
  }

  async function stopTracking(jobId: string) {
    await prisma.jobTracking.updateMany({
      where: { jobId },
      data: {
        isAvailable: false,
        lastError: 'tracking_stopped',
      },
    }).catch(() => undefined);
  }

  async function startTrackingHeartbeatCheck() {
    // Server-side stale detection - could be enhanced with intervals
    setInterval(async () => {
      try {
        const threshold = new Date(Date.now() - STALE_THRESHOLD_SECONDS * 1000);
        const stale = await prisma.jobTracking.findMany({
          where: {
            isAvailable: true,
            lastHeartbeatAt: { lt: threshold },
          },
          include: { job: { include: { customer: { select: { userId: true } } } } },
        });

        for (const t of stale) {
          await prisma.jobTracking.update({
            where: { id: t.id },
            data: { isAvailable: false, lastError: 'stale_heartbeat' },
          });
          if (t.job.customer.userId) {
            realtime.emitToUser(t.job.customer.userId, REALTIME_EVENTS.BOOKING_TRACKING_UNAVAILABLE, {
              bookingId: t.jobId,
              reason: 'stale',
              at: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        logger.error('Tracking heartbeat check failed', e);
      }
    }, 15000);
  }

  return {
    updateLocation,
    setTrackingStatus,
    getTrackingStatus,
    getLatestLocation,
    stopTracking,
    startTrackingHeartbeatCheck,
    verifyBookingAccess,
  };
}

export type TrackingService = ReturnType<typeof createTrackingService>;

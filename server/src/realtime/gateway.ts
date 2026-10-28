import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { AppConfig } from '../config';
import { logger } from '../common/logger';
import type { AuthService } from '../auth/auth.service';
import { bearerToken, type TokenVerifier } from '../auth/token';
import type { PrismaClient } from '../database/prisma';

/**
 * Realtime delivery for the order-service lifecycle.
 *
 * Two rules govern everything here (CLAUDE.md "Realtime"):
 *  - REST stays the source of truth for persistent state. A socket event
 *    *notifies* a client that something changed; it never *is* the change.
 *  - Handshakes are authenticated before any room is joined. Privilege is read
 *    from our database via `authService.syncUser`, never from the token; the
 *    handshake also carries the surface (`X-App-Type`-equivalent `appType`).
 */

/**
 * Event names the API emits. The mobile clients subscribe to the ones they
 * care about; the payload for each is the REST DTO for the changed resource.
 */
export const REALTIME_EVENTS = {
  /**
   * A new open (REQUESTED, unassigned) job landed that eligible pros may want.
   * Payload: `AvailableJob`. The pull-style available-jobs feed is the source
   * of truth; this is a nudge to refetch.
   */
  JOB_NEW: 'job:new',
  /**
   * A job the recipient is party to changed state. Payload: `JobDetail`
   * shaped for the viewer. REST remains the source of truth.
   */
  JOB_STATUS: 'job:status',
  /**
   * A new chat message was posted to a job the recipient is party to. Payload:
   * `ChatMessage`. The messages REST feed remains the source of truth; this is
   * the live delivery so a chat screen updates without a poll.
   */
  MESSAGE_NEW: 'message:new',
  /**
   * The recipient's device delivered messages the caller sent. Payload:
   * `MessageReceiptUpdate`. Drives the single-tick → double-tick transition.
   */
  MESSAGE_DELIVERED: 'message:delivered',
  /**
   * The recipient's app read messages the caller sent. Payload:
   * `MessageReceiptUpdate`. Drives the double-tick → double-blue transition.
   */
  MESSAGE_READ: 'message:read',
  /**
   * A job's thread changed its unread count for the recipient. Payload:
   * `{ jobId, unreadCount, recipientRole }`. Carried on the role that must
   * re-render its badge so surfaces of the same account stay independent.
   */
  MESSAGE_UNREAD: 'message:unread',
  /**
   * A customer's unread notification count changed. Payload:
   * `{ unreadCount }`. Emitted by the notifications service whenever a notice
   * is recorded or marked read; drives the bell pill on the customer's home
   * screen. REST (`GET /notifications`) remains the source of truth.
   */
  NOTIFICATION_UNREAD: 'notification:unread',
  /**
   * An open-job offer ended for the recipient pro because they declined it —
   * either an explicit tap in the app or a reject via the signed offer token.
   * Payload: `{ jobId }`. This lets the pending-offer UI drop the job the
   * moment a decline is recorded, so the tray and the incoming-jobs screen
   * agree without waiting for the offer window to close.
   */
  JOB_OFFER_ENDED: 'job:offer:ended',
  /**
   * Live location update for a booking from the professional.
   */
  BOOKING_LOCATION_UPDATED: 'booking:location:updated',
  /**
   * Live tracking became unavailable (e.g. GPS disabled).
   */
  BOOKING_TRACKING_UNAVAILABLE: 'booking:tracking:unavailable',
  /**
   * Live tracking was restored after being unavailable.
   */
  BOOKING_TRACKING_RESTORED: 'booking:tracking:restored',
  /**
   * Tracking status update for a booking.
   */
  BOOKING_TRACKING_STATUS: 'booking:tracking:status',
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/**
 * Authentication + authorization for the socket handshake.
 *
 * The token is verified the same way as any REST request and the local user is
 * looked up from the database, so a cancelled account cannot keep a socket
 * open and privilege (`isAdmin`) is never taken from the token.
 */
export interface RealtimeSession {
  verifier: TokenVerifier;
  authService: AuthService;
  prisma?: PrismaClient;
  services?: any;
}

/**
 * Concurrent sockets allowed from one address.
 *
 * WebSockets sidestep HTTP rate limiting entirely — each connection is one
 * upgrade request, then unlimited frames — so connection count is capped here
 * instead. Generous enough for a household or small office behind one NAT.
 */
const MAX_SOCKETS_PER_IP = 20;

const UNAUTHORIZED = new Error('unauthorized');

export interface RealtimeService {
  /** Binds the Socket.IO server to the HTTP server and enforces auth. */
  attach(httpServer: HttpServer, session: RealtimeSession): void;
  /** Fires an event to every socket of one user (all their devices). */
  emitToUser(userId: string, event: RealtimeEvent, payload: unknown): void;
  /** Fires an event to a list of users in one pass. */
  emitToUsers(userIds: string[], event: RealtimeEvent, payload: unknown): void;
  /** Fires an event to a room. */
  emitToRoom?(room: string, event: RealtimeEvent, payload: unknown): void;
  /**
   * Disconnects a user's sockets — all of them, or only those on one surface
   * (`appType`). Account deletion uses it to drop a deleted identity's sockets
   * at finalize; `appType: 'pro'` ejects only the Pro app so a surviving
   * customer session stays live.
   */
  disconnectUser(userId: string, options?: { appType?: string }): void;
  close(): Promise<void>;
}

export function createRealtimeService(config: AppConfig): RealtimeService {
  let io: SocketServer | null = null;

  const socketsByIp = new Map<string, number>();

  function attach(httpServer: HttpServer, session: RealtimeSession & { prisma?: PrismaClient }): void {
    if (io) return;

    io = new SocketServer(httpServer, {
      path: '/realtime',
      cors: {
        origin: config.corsOrigins.length > 0 ? config.corsOrigins : !config.isProduction,
        credentials: true,
      },
      // Bound a single frame. Without this, one client can stream an unbounded
      // buffer into server memory.
      maxHttpBufferSize: 100_000,
      // Drop a peer that stops answering pings rather than holding the socket,
      // its buffers and its room memberships open indefinitely.
      pingInterval: 25_000,
      pingTimeout: 20_000,
      // Long-poll fallback keeps a request open per poll; prefer a real upgrade.
      transports: ['websocket', 'polling'],
      connectTimeout: 10_000,
    });

    io.use((socket, next) => {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        bearerToken(socket.handshake.headers.authorization);
      // The client knows which surface it is; provisioning new accounts needs it.
      const appType = socket.handshake.auth?.appType as string | undefined;

      if (!token) return next(UNAUTHORIZED);

      void session.verifier
        .verify(token)
        .then(async (verified) => {
          if (!verified) return next(UNAUTHORIZED);
          const user = await session.authService.syncUser(verified, appType);
          if (!user.isActive) return next(new Error('forbidden'));
          if (user.deletedAt) return next(UNAUTHORIZED);
          socket.data.user = { id: user.id, isAdmin: user.isAdmin, appType: user.appType };
          next();
        })
        .catch(next);
    });

    io.on('connection', (socket) => {
      const ip = socket.handshake.address;
      const current = socketsByIp.get(ip) ?? 0;

      if (current >= MAX_SOCKETS_PER_IP) {
        logger.warn(`Refusing socket from ${ip}: ${current} connections already open.`);
        // disconnect(true) closes the underlying transport, not just the namespace.
        socket.disconnect(true);
        return;
      }

      socketsByIp.set(ip, current + 1);
      logger.debug(`Socket connected: ${socket.id} (${current + 1} from ${ip})`);

      // Authenticated already, so the room key is the identity the events fan out on.
      void socket.join(`user:${socket.data.user.id}`);
      socket.data.userId = socket.data.user.id;

      // Tracking room subscription (opt-in)
      socket.on('booking:tracking:subscribe', async (payload: any) => {
        try {
          const bookingId = payload?.bookingId;
          if (!bookingId || !session.prisma) return;
          const job = await session.prisma.job.findUnique({
            where: { id: bookingId },
            include: { customer: { select: { userId: true } }, pro: { select: { userId: true } } },
          });
          if (!job) return;
          const uid = socket.data.user.id;
          if (job.customer.userId !== uid && job.pro?.userId !== uid) return;
          await socket.join(`booking:${bookingId}:tracking`);
        } catch (e) {
          logger.debug('tracking subscribe failed', e);
        }
      });
      socket.on('booking:tracking:unsubscribe', async (payload: any) => {
        try {
          const bookingId = payload?.bookingId;
          if (!bookingId) return;
          await socket.leave(`booking:${bookingId}:tracking`);
        } catch {}
      });

      // Pro directly emits location updates over socket (fallback path)
      socket.on('pro:location:update', async (payload: any) => {
        try {
          const uid = socket.data.user.id;
          const appType = socket.data.user.appType;
          if (appType !== 'pro') return;
          const bookingId = payload?.bookingId;
          if (!bookingId) return;
          if ((session as any).services?.tracking?.updateLocation) {
            await (session as any).services.tracking.updateLocation(uid, payload);
            return;
          }
        } catch (e) {
          logger.debug('pro:location:update failed', e);
        }
      });

      socket.on('pro:tracking:status', async (payload: any) => {
        try {
          const uid = socket.data.user.id;
          const appType = socket.data.user.appType;
          if (appType !== 'pro') return;
          const bookingId = payload?.bookingId;
          if (!bookingId || !session.prisma) return;
          const status = payload?.status === 'available' ? 'available' : 'unavailable';
          await (session as any).services?.tracking?.setTrackingStatus?.(uid, { bookingId, status, reason: payload?.reason });
        } catch (e) {
          logger.debug('pro:tracking:status failed', e);
        }
      });

      socket.on('disconnect', (reason) => {
        const remaining = (socketsByIp.get(ip) ?? 1) - 1;
        // Delete at zero so the map cannot grow unbounded across many addresses —
        // otherwise this counter becomes its own slow memory leak.
        if (remaining <= 0) socketsByIp.delete(ip);
        else socketsByIp.set(ip, remaining);

        logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
      });
    });
  }

  function emitToUser(userId: string, event: RealtimeEvent, payload: unknown): void {
    if (!io) {
      logger.debug(`Realtime not attached; dropped ${event} for ${userId}.`);
      return;
    }
    io.to(`user:${userId}`).emit(event, payload);
  }

  function emitToUsers(userIds: string[], event: RealtimeEvent, payload: unknown): void {
    if (!io || userIds.length === 0) return;
    io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
  }

  function emitToRoom(room: string, event: RealtimeEvent, payload: unknown): void {
    if (!io) {
      logger.debug(`Realtime not attached; dropped ${event} for room ${room}.`);
      return;
    }
    io.to(room).emit(event, payload);
  }

  function disconnectUser(userId: string, options?: { appType?: string }): void {
    if (!io) return;
    for (const socket of io.sockets.sockets.values()) {
      const user = socket.data?.user as { id?: string; appType?: string | null } | undefined;
      if (user?.id !== userId) continue;
      if (options?.appType && user.appType !== options.appType) continue;
      socket.disconnect(true);
    }
  }

  async function close(): Promise<void> {
    if (!io) return;
    const server = io;
    io = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return { attach, emitToUser, emitToUsers, emitToRoom, disconnectUser, close };
}

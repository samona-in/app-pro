import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { AppConfig } from '../config';
import { logger } from '../common/logger';

/**
 * Socket.IO connection lifecycle.
 *
 * Foundation only: it accepts connections and logs them. No job, location or
 * payment events are wired up yet.
 *
 * Two rules govern what gets added here (CLAUDE.md "Realtime"):
 *  - REST stays the source of truth for persistent state. A socket event
 *    notifies clients that something changed; it never *is* the change.
 *  - Handshakes must be authenticated before any room is joined. Until the auth
 *    domain lands, this gateway exposes no subscriptions.
 */

/**
 * Concurrent sockets allowed from one address.
 *
 * WebSockets sidestep HTTP rate limiting entirely — each connection is one
 * upgrade request, then unlimited frames — so connection count is capped here
 * instead. Generous enough for a household or small office behind one NAT.
 */
const MAX_SOCKETS_PER_IP = 20;

export function createRealtimeGateway(httpServer: HttpServer, config: AppConfig): SocketServer {
  const io = new SocketServer(httpServer, {
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

  const socketsByIp = new Map<string, number>();

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

    socket.on('disconnect', (reason) => {
      const remaining = (socketsByIp.get(ip) ?? 1) - 1;
      // Delete at zero so the map cannot grow unbounded across many addresses —
      // otherwise this counter becomes its own slow memory leak.
      if (remaining <= 0) socketsByIp.delete(ip);
      else socketsByIp.set(ip, remaining);

      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

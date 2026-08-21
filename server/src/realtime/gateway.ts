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
export function createRealtimeGateway(httpServer: HttpServer, config: AppConfig): SocketServer {
  const io = new SocketServer(httpServer, {
    path: '/realtime',
    cors: {
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : !config.isProduction,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);
    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

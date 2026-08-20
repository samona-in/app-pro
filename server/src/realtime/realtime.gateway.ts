import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

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
@WebSocketGateway({ namespace: '/realtime', cors: { origin: false } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }
}

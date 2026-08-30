import { io, type Socket } from 'socket.io-client';
import { APP_TYPES, REALTIME_PATH } from '@samona/config';
import type { JobDetail } from '@samona/types';
import { env } from '@/env';

/**
 * The realtime channel to the SAMONA gateway (customer surface).
 *
 * Two rules govern it (CLAUDE.md "Realtime"):
 *  - REST stays the source of truth. An event tells the app that something
 *    changed; the UI refetches rather than trusting the payload alone.
 *  - The socket carries the same Supabase token as REST plus its surface
 *    (`appType`), so provisioning works for new accounts. The handshake fails
 *    closed: no token, no connection.
 */
export interface RealtimeEventMap {
  /** A booking the caller is party to changed state. Payload: JobDetail. */
  'job:status': JobDetail;
}
type RealtimeEvent = keyof RealtimeEventMap;
/** Union over every event's payload; the socket itself is untyped. */
type RealtimePayload = RealtimeEventMap[RealtimeEvent];
type RealtimeHandler = (payload: RealtimePayload) => void;

let socket: Socket | null = null;

function ensureSocket(): Socket {
  if (!socket) {
    socket = io(env.apiUrl, {
      path: REALTIME_PATH,
      autoConnect: false,
    });
  }
  return socket;
}

/**
 * Authenticates the socket with the current access token and connects it.
 *
 * Safe to call again on a token refresh: the auth is updated for the next
 * connection attempt without tearing down the live socket.
 */
export function connectRealtime(token: string): void {
  const connected = ensureSocket();
  connected.auth = { token, appType: APP_TYPES.CUSTOMER };
  connected.connect();
}

/** Drops the socket entirely, e.g. on sign-out. */
export function disconnectRealtime(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/**
 * Subscribes to one event. Returns an unsubscribe function.
 *
 * May be called before the socket is connected; listeners are registered the
 * moment `connectRealtime` fires.
 */
export function subscribe(event: RealtimeEvent, handler: RealtimeHandler): () => void {
  const connected = ensureSocket();
  const listener = (...args: unknown[]) => handler(args[0] as RealtimePayload);
  connected.on(event, listener);
  return () => {
    connected.off(event, listener);
  };
}

export function isRealtimeConnected(): boolean {
  return socket?.connected ?? false;
}

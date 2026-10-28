import * as Location from 'expo-location';
import { AppState, Vibration } from 'react-native';
import { proTrackingService } from './tracking';
import { getRealtimeSocket } from './realtime';
import type { Socket } from 'socket.io-client';

export interface JobTrackingState {
  isTracking: boolean;
  isAvailable: boolean;
  lastError?: string | null;
}

let socketRef: Socket | null = null;
let watchSub: Location.LocationSubscription | null = null;
let seq = 0;
let currentBookingId: string | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

function getSocket(): Socket | null {
  if (socketRef) return socketRef;
  try {
    const { getRealtimeSocket } = require('./realtime') as any;
    if (typeof getRealtimeSocket === 'function') {
      socketRef = getRealtimeSocket();
      return socketRef;
    }
  } catch {}
  try {
    const { getSocket: gs } = require('./realtime') as any;
    if (typeof gs === 'function') {
      socketRef = gs();
      return socketRef;
    }
  } catch {}
  return null;
}

export async function ensureLocationReadyForJob(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return { ok: false, reason: 'foreground_permission' };
    const services = await Location.hasServicesEnabledAsync();
    if (!services) return { ok: false, reason: 'location_services_off' };
    // Try to get a fix
    try {
      await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      // still ok if we can watch later, but be strict-ish
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'unknown' };
  }
}

export async function startJobTracking(bookingId: string) {
  if (currentBookingId === bookingId && watchSub) return;
  await stopJobTracking();
  currentBookingId = bookingId;
  seq = 0;

  const ready = await ensureLocationReadyForJob();
  if (!ready.ok) {
    try {
      const sock = getSocket();
      sock?.emit('pro:tracking:status', { bookingId, status: 'unavailable', reason: ready.reason });
    } catch {}
    try {
      await proTrackingService.updateLocation({ bookingId, status: 'unavailable', reason: ready.reason } as any);
    } catch {}
    // vibrate while visible? caller should show blocking UI
    Vibration.vibrate([500, 500, 500], true);
    // keep trying
    interval = setInterval(async () => {
      const r = await ensureLocationReadyForJob();
      if (r.ok) {
        if (interval) { clearInterval(interval); interval = null; }
        Vibration.cancel();
        await startJobTracking(bookingId);
      }
    }, 2000);
    return;
  }

  Vibration.cancel();
  try {
    const sock = getSocket();
    sock?.emit('pro:tracking:status', { bookingId, status: 'available' });
  } catch {}
  try {
    await proTrackingService.updateLocation({ bookingId, status: 'available' } as any);
  } catch {}

  watchSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 3000 },
    async (loc) => {
      seq += 1;
      const payload = {
        bookingId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
        speed: loc.coords.speed ?? null,
        heading: loc.coords.heading ?? null,
        recordedAt: new Date(loc.timestamp).toISOString(),
        sequence: seq,
      };
      try {
        const sock = getSocket();
        sock?.emit('pro:location:update', payload);
      } catch {}
      try {
        await proTrackingService.updateLocation(payload);
      } catch {}
    },
  );
}

export async function stopJobTracking() {
  if (watchSub) {
    try { watchSub.remove(); } catch {}
    watchSub = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  Vibration.cancel();
  if (currentBookingId) {
    try {
      const sock = getSocket();
      sock?.emit('pro:tracking:status', { bookingId: currentBookingId, status: 'unavailable', reason: 'stopped' });
    } catch {}
    try {
      await proTrackingService.updateLocation({ bookingId: currentBookingId, status: 'unavailable', reason: 'stopped' } as any);
    } catch {}
  }
  currentBookingId = null;
  seq = 0;
}

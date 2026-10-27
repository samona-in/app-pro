import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { APP_TYPES, REALTIME_PATH } from '@samona/config';
import { env } from '@/env';
import { i18nInstance } from '@/i18n';
import { api } from './api';
import { checkDeviceReadiness, isDeviceReady } from './device-readiness-state';
import { useProLocationStore } from '@/stores/pro-location';
import {
  type OnlineStatus,
  type OnlineStatusState,
  setStatus as setStatusState,
  getIsTransitioning,
  setIsTransitioning,
  getOnlineStatus as getStatusState,
} from './online-status-state';

export type { OnlineStatus, OnlineStatusState };
export {
  subscribeToOnlineStatus,
  isOnlineStatusKnown,
  reconcileOnlineStatus,
} from './online-status-state';

/**
 * Message shown when the OS-wide Location Services toggle is off. Resolved per
 * call so it always matches the current app language; the sentinel check below
 * compares against the same call so a throw and a compare stay in lockstep.
 */
export const LOCATION_SERVICES_DISABLED_MESSAGE = (): string =>
  i18nInstance.t('onlineStatus.locationDisabledMessage');

/** true when a failure is the OS Location Services toggle being off. */
export function isLocationServicesDisabledError(message: string | undefined): boolean {
  return message === LOCATION_SERVICES_DISABLED_MESSAGE();
}

let abortController: AbortController | null = null;

/**
 * A pro whose phone can swallow push-delivered job alerts must not be allowed
 * to go online "deaf" — the alert is the product. This hard gate returns a
 * sentinel reason the UI routes to the /device-setup fix-it screen.
 */
export const DEVICE_NOT_READY_REASON = 'device-not-ready';
export const DEVICE_NOT_READY_MESSAGE = (): string =>
  i18nInstance.t('onlineStatus.deviceNotReadyMessage');

type DeviceNotReadyError = Error & { reason: typeof DEVICE_NOT_READY_REASON };

function isDeviceNotReadyError(error: unknown): error is DeviceNotReadyError {
  return (
    error instanceof Error && (error as { reason?: unknown }).reason === DEVICE_NOT_READY_REASON
  );
}

function newDeviceNotReadyError(): DeviceNotReadyError {
  const error = new Error(DEVICE_NOT_READY_MESSAGE()) as DeviceNotReadyError;
  error.reason = DEVICE_NOT_READY_REASON;
  return error;
}

/** Result of an availability toggle. Blocks report a `reason` the UI routes on. */
export type AvailabilityResult = {
  success: boolean;
  error?: string;
  reason?: typeof DEVICE_NOT_READY_REASON;
};

/**
 * Hard gate: on Android, every OS setting that governs whether a push can raise
 * an alert while the app is closed must be in place first. The pro is routed to
 * /device-setup through the sentinel reason rather than being presented a bare
 * failure. Non-Android runs are never blocked.
 */
async function assertDeviceReady(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const readiness = await checkDeviceReadiness();
  if (!isDeviceReady(readiness)) {
    throw newDeviceNotReadyError();
  }
}

let socket: Socket | null = null;
let _socketReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

function setStatus(status: OnlineStatus, error: string | null = null): void {
  setStatusState(status, error);
}

async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Location error codes where the fix can't be obtained right now. */
const LOCATION_UNAVAILABLE_CODES = new Set([
  'ERR_LOCATION_SERVICES_DISABLED',
  'ERR_LOCATION_UNAVAILABLE',
]);

async function getValidLocation(): Promise<{ latitude: number; longitude: number }> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      // On Android this surfaces the system "enable location" prompt when the
      // master toggle is off, instead of just failing.
      mayShowUserSettingsDialog: true,
    });
    const coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    useProLocationStore.getState().setCoordinates(coordinates);
    return coordinates;
  } catch (error) {
    // Surface one clear, actionable reason instead of a raw fatal error.
    const code = (error as { code?: string } | null)?.code;
    if (code && LOCATION_UNAVAILABLE_CODES.has(code)) {
      throw new Error(LOCATION_SERVICES_DISABLED_MESSAGE());
    }
    throw error;
  }
}

/**
 * Monitors the OS-wide Location Services toggle while the pro is online. The
 * moment it flips off mid-session we prompt immediately (Rapido-captain style)
 * with a one-tap "Open Settings" action. The prompt is global, so it appears
 * no matter which screen the pro is on. Stops when the pro goes offline.
 */
let locationWatchTimer: ReturnType<typeof setInterval> | null = null;
let locationWasEnabled = true;
let locationPromptShowing = false;

const LOCATION_POLL_MS = 3000;

async function checkLocationEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

function showLocationServicesPrompt(): void {
  const alreadyShowing = locationPromptShowing;
  if (alreadyShowing) return;
  locationPromptShowing = true;
  Alert.alert(
    i18nInstance.t('onlineStatus.locationServicesOff'),
    i18nInstance.t('onlineStatus.locationServicesOnMessage'),
    [
      {
        text: i18nInstance.t('common.openSettings'),
        onPress: () => {
          locationPromptShowing = false;
          void Linking.openSettings();
        },
      },
      {
        text: i18nInstance.t('common.ok'),
        style: 'cancel',
        onPress: () => {
          locationPromptShowing = false;
        },
      },
    ],
  );
}

export function startLocationServicesMonitor(): void {
  if (locationWatchTimer) return;
  locationWasEnabled = true;
  locationWatchTimer = setInterval(async () => {
    const enabled = await checkLocationEnabled();
    if (!enabled && locationWasEnabled) {
      showLocationServicesPrompt();
    }
    locationWasEnabled = enabled;
  }, LOCATION_POLL_MS);
}

export function stopLocationServicesMonitor(): void {
  if (locationWatchTimer) {
    clearInterval(locationWatchTimer);
    locationWatchTimer = null;
  }
}

function createSocket(): Socket {
  const newSocket = io(env.apiUrl, {
    path: REALTIME_PATH,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_DELAY_MS,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  });

  newSocket.on('connect', () => {
    _socketReconnectAttempts = 0;
    console.log('[OnlineStatus] Socket connected');
  });

  newSocket.on('disconnect', (reason) => {
    console.log('[OnlineStatus] Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
      newSocket.connect();
    }
  });

  newSocket.on('reconnect_attempt', (attemptNumber) => {
    _socketReconnectAttempts = attemptNumber;
    console.log('[OnlineStatus] Socket reconnect attempt:', attemptNumber);
  });

  newSocket.on('reconnect', (attemptNumber) => {
    console.log('[OnlineStatus] Socket reconnected after', attemptNumber, 'attempts');
    _socketReconnectAttempts = 0;
  });

  newSocket.on('reconnect_failed', () => {
    console.log('[OnlineStatus] Socket reconnection failed');
  });

  newSocket.on('connect_error', (error) => {
    console.log('[OnlineStatus] Socket connect error:', error.message);
  });

  return newSocket;
}

function ensureSocket(): Socket {
  if (!socket) {
    socket = createSocket();
  }
  return socket;
}

function connectSocket(token: string): void {
  const s = ensureSocket();
  s.auth = { token, appType: APP_TYPES.PRO };
  s.connect();
}

function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  _socketReconnectAttempts = 0;
}

export async function goOnline(token: string): Promise<AvailabilityResult> {
  if (getIsTransitioning()) {
    return { success: false, error: 'Already transitioning' };
  }

  abortController = new AbortController();
  setStatus('loading');

  try {
    if (abortController.signal.aborted) throw new Error('Aborted');

    // Block first: going online is pointless if the phone cannot surface a
    // job alert. Throws the sentinel the UI routes to /device-setup.
    await assertDeviceReady();

    // Ask for the app's location permission up front — this surfaces the OS
    // permission dialog directly, which is all we can do from code and the
    // most common first-time friction. The system-wide Location Services
    // toggle cannot be flipped by an app, so that's only a terminal fallback.
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      const message = i18nInstance.t('onlineStatus.permNeeded');
      setStatus('offline', message);
      return { success: false, error: message };
    }

    if (abortController.signal.aborted) throw new Error('Aborted');

    const coordinates = await getValidLocation();

    if (abortController.signal.aborted) throw new Error('Aborted');

    connectSocket(token);

    const patch = {
      isOnline: true,
      coordinates,
    } as const;

    await api.post('/pros/availability', patch);

    startLocationServicesMonitor();

    setStatus('online');
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : i18nInstance.t('onlineStatus.failedGoOnline');
    setStatus('offline', message);
    disconnectSocket();
    if (isDeviceNotReadyError(error)) {
      return { success: false, error: message, reason: DEVICE_NOT_READY_REASON };
    }
    return { success: false, error: message };
  }
}

export async function goOffline(_token: string): Promise<AvailabilityResult> {
  if (getIsTransitioning()) {
    return { success: false, error: 'Already transitioning' };
  }

  abortController = new AbortController();
  setStatus('loading');

  try {
    const patch = { isOnline: false };
    await api.post('/pros/availability', patch);

    stopLocationServicesMonitor();
    disconnectSocket();

    setStatus('offline');
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : i18nInstance.t('onlineStatus.failedGoOffline');
    setStatus('offline', message);
    return { success: false, error: message };
  }
}

export function cancelTransition(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  const status = getStatusState().status;
  if (status === 'loading') {
    setStatus('offline');
  }
  setIsTransitioning(false);
}

export { isOnline, isOffline, getOnlineStatus } from './online-status-state';

export function getSocket(): Socket | null {
  return socket;
}

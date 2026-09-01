import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { io, type Socket } from 'socket.io-client';
import { APP_TYPES, REALTIME_PATH } from '@samona/config';
import type { JobDetail } from '@samona/types';
import { env } from '@/env';
import { jobNotificationService } from './job-notifications';
import { api } from './api';

export type OnlineStatus = 'offline' | 'checking-location' | 'requesting-permission' | 'getting-location' | 'connecting' | 'online' | 'offlining' | 'error';

export interface OnlineStatusState {
  status: OnlineStatus;
  error: string | null;
  isTransitioning: boolean;
}

type OnlineStatusListener = (state: OnlineStatusState) => void;

const listeners = new Set<OnlineStatusListener>();

let currentStatus: OnlineStatus = 'offline';
let currentError: string | null = null;
let isTransitioning = false;
let abortController: AbortController | null = null;

let socket: Socket | null = null;
let _socketReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

function notifyListeners(): void {
  listeners.forEach((listener) => {
    listener({
      status: currentStatus,
      error: currentError,
      isTransitioning,
    });
  });
}

function setStatus(status: OnlineStatus, error: string | null = null): void {
  currentStatus = status;
  currentError = error;
  isTransitioning = status !== 'offline' && status !== 'online' && status !== 'error';
  notifyListeners();
}

export function subscribeToOnlineStatus(listener: OnlineStatusListener): () => void {
  listeners.add(listener);
  listener({ status: currentStatus, error: currentError, isTransitioning });
  return () => listeners.delete(listener);
}

export function getOnlineStatus(): OnlineStatusState {
  return { status: currentStatus, error: currentError, isTransitioning };
}

async function checkLocationServicesEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch {
    return false;
  }
}

async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

async function getValidLocation(): Promise<{ latitude: number; longitude: number }> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
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
    syncPendingJobs();
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

async function syncPendingJobs(): Promise<void> {
  try {
    const jobs = await api.get<JobDetail[]>('/jobs/mine', {
      query: { status: 'REQUESTED', limit: 10 },
    });
    for (const job of jobs) {
      if (job.proId && job.status === 'REQUESTED') {
        jobNotificationService.handleJobNotification(job.id, 'socket');
      }
    }
  } catch (error) {
    console.log('[OnlineStatus] Failed to sync pending jobs:', error);
  }
}

export async function goOnline(token: string): Promise<{ success: boolean; error?: string }> {
  if (isTransitioning) {
    return { success: false, error: 'Already transitioning' };
  }
  if (currentStatus === 'online') {
    return { success: true };
  }

  abortController = new AbortController();
  setStatus('checking-location');

  try {
    if (abortController.signal.aborted) throw new Error('Aborted');

    const hasServices = await checkLocationServicesEnabled();
    if (!hasServices) {
      setStatus('error', 'Location services are turned off. Please enable location services to go online and receive jobs.');
      return { success: false, error: currentError ?? undefined };
    }

    if (abortController.signal.aborted) throw new Error('Aborted');
    setStatus('requesting-permission');

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      setStatus('error', 'Location permission is needed to go online and match with jobs near you.');
      return { success: false, error: currentError ?? undefined };
    }

    if (abortController.signal.aborted) throw new Error('Aborted');
    setStatus('getting-location');

    const coordinates = await getValidLocation();

    if (abortController.signal.aborted) throw new Error('Aborted');
    setStatus('connecting');

    connectSocket(token);

    jobNotificationService.initialize();

    const patch = {
      isOnline: true,
      coordinates,
    } as const;

    await api.post('/pros/availability', patch);

    setStatus('online');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to go online';
    setStatus('error', message);
    disconnectSocket();
    return { success: false, error: message };
  }
}

export async function goOffline(_token: string): Promise<{ success: boolean; error?: string }> {
  if (isTransitioning && currentStatus !== 'online') {
    return { success: false, error: 'Already transitioning' };
  }
  if (currentStatus === 'offline') {
    return { success: true };
  }

  abortController = new AbortController();
  setStatus('offlining');

  try {
    jobNotificationService.cleanup();
    jobNotificationService.dismissJob();

    const patch = { isOnline: false };
    await api.post('/pros/availability', patch);

    disconnectSocket();

    setStatus('offline');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to go offline';
    setStatus('error', message);
    return { success: false, error: message };
  }
}

export function cancelTransition(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isTransitioning = false;
  if (currentStatus === 'offlining') {
    setStatus('online');
  } else if (currentStatus !== 'online' && currentStatus !== 'offline') {
    setStatus('offline');
  }
}

export function isOnline(): boolean {
  return currentStatus === 'online';
}

export function isOffline(): boolean {
  return currentStatus === 'offline';
}

export function getSocket(): Socket | null {
  return socket;
}
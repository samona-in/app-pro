import { AppState, Platform } from 'react-native';
import { isApiError, isRetryable } from '@samona/api-client';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { CustomerNotification, CustomerNotificationUnread } from '@samona/types';
import type { RegisterPushTokenInput } from '@samona/validation';
import { api } from './api';
import { env } from '@/env';

/**
 * Push notifications for the Customer app.
 *
 * The server is the single deliverer and writer of notification state — this
 * module only (a) asks the device for permission and the device's push token
 * (raw FCM on Android via the bundled `google-services.json`, the Expo push
 * service elsewhere) and (b) tells the server where to send. The server stores
 * the token on the caller's Customer profile and uses it for chat-message
 * notifications, so a customer hears back even when the booking screen is
 * closed.
 */

/** Foreground pushes present as a banner with a sound, like the Pro app. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * The channel chat notification pushes are delivered on (Android). "v2":
 * Android won't let an app change a channel's sound once created, and the
 * original `chat_messages` channel was created silent, so this id (matching
 * the server) starts fresh with the device default sound.
 */
export const CHAT_CHANNEL = 'chat_messages_v2';

/** The channel booking-status pushes (accepted, on the way, arrived, etc.) raise on. */
export const JOB_STATUS_CHANNEL = 'job_updates';

/** Matches the backend channel for the customer's start-work code. */
export const JOB_OTP_CHANNEL = 'job_otp';

/** EAS project id used to mint Expo push tokens (see the Pro app for the chain). */
const PROJECT_ID =
  env.easProjectId ?? Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHAT_CHANNEL, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    // Omitting `sound` — not `sound: null`, which is silent — makes the channel
    // use the device's default notification sound. A bare string would be
    // treated as a custom sound name and must be shipped via the
    // expo-notifications plugin `sounds` array, which chat has no need for.
    vibrationPattern: [0, 250, 250],
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(JOB_STATUS_CHANNEL, {
    name: 'Booking updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250],
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(JOB_OTP_CHANNEL, {
    name: 'Start-work codes',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250],
    enableVibrate: true,
  });
}

// An old session's in-flight request must finish before another customer
// registers this installation with the shared API client.
let tokenUploadQueue: Promise<unknown> = Promise.resolve();

function logTokenEvent(event: string, token: string): void {
  const label = token.length > 12 ? `…${token.slice(-6)}` : '[redacted]';
  // eslint-disable-next-line no-console -- Full device tokens never appear in lifecycle logs.
  console.log(`[Notifications] ${event}, token=${label}`);
}

/**
 * Keep the current customer's token synchronized on startup, native refresh,
 * network recovery and foreground. Android supplies native FCM tokens; iOS
 * keeps Expo delivery. The supplied bearer getter is scoped to this customer.
 */
export function startPushTokenSync(getAccessToken: () => Promise<string | null>) {
  let active = Platform.OS !== 'web';
  let latestNative: Notifications.DevicePushToken | undefined;
  let uploadedToken: string | null = null;
  let pending = false;
  let forceUpload = true;
  let running: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let permissionAsked = false;

  async function synchronize(): Promise<void> {
    await ensureChannel();
    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted;
    if (!granted && !permissionAsked) {
      permissionAsked = true;
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!active || !granted) return;

    const native = latestNative ?? (await Notifications.getDevicePushTokenAsync());
    if (!active) return;
    if (latestNative && latestNative.data !== native.data) {
      pending = true;
      return;
    }
    latestNative = native;
    // getDevicePushTokenAsync can emit this same token. Consume that event so
    // a failed upload respects backoff instead of immediately uploading again.
    pending = false;
    const isAndroid = Platform.OS === 'android';
    if (!isAndroid && !PROJECT_ID) return;
    const pushToken = isAndroid
      ? String(native.data)
      : (
          await Notifications.getExpoPushTokenAsync({
            projectId: PROJECT_ID,
            devicePushToken: native,
          })
        ).data;
    if (!active) return;
    const force = forceUpload;
    forceUpload = false;
    if (!force && uploadedToken === pushToken) return;

    const upload = tokenUploadQueue.then(async () => {
      const accessToken = await getAccessToken();
      if (!active || !accessToken) return;
      await api.post(
        '/notifications/register-token',
        {
          pushToken,
          platform: isAndroid ? 'android' : 'ios',
          provider: isAndroid ? 'fcm' : 'expo',
        } satisfies RegisterPushTokenInput,
        {
          skipAuth: true,
          headers: { Authorization: `Bearer ${accessToken}` },
          timeoutMs: 10000,
        },
      );
      uploadedToken = pushToken;
      attempt = 0;
      logTokenEvent('Customer device registered', pushToken);
    });
    // Keep the serialization queue usable after a rejected request; the caller
    // still receives the rejection and schedules the appropriate recovery.
    tokenUploadQueue = upload.catch(() => undefined);
    await upload;
  }

  function requestSync(): void {
    if (!active) return;
    pending = true;
    if (running || retryTimer) return;
    running = (async () => {
      while (active && pending) {
        pending = false;
        try {
          await synchronize();
        } catch (error) {
          uploadedToken = null;
          console.warn('[Notifications] Customer token synchronization failed', {
            status: isApiError(error) ? error.status : 'native-or-network',
          });
          if (active && (!isApiError(error) || isRetryable(error))) {
            const backoff = Math.min(60000, 1000 * 2 ** Math.min(attempt++, 6));
            const delay = Math.max(
              backoff + Math.round(Math.random() * 1000),
              isApiError(error) ? (error.retryAfterMs ?? 0) : 0,
            );
            retryTimer = setTimeout(() => {
              retryTimer = undefined;
              requestSync();
            }, delay);
            pending = false;
          }
          // Preserve newer token/session events queued during a permanent
          // rejection. A transient failure waits and uploads the latest token.
        }
      }
    })().finally(() => {
      running = null;
      if (active && pending) requestSync();
    });
  }

  const tokenSubscription = active
    ? Notifications.addPushTokenListener((token) => {
        if (!active || token.type !== Platform.OS || token.data === latestNative?.data) return;
        latestNative = token;
        logTokenEvent('Customer native token refreshed', String(token.data));
        requestSync();
      })
    : null;
  const stateSubscription = active
    ? AppState.addEventListener('change', (state) => {
        if (!active || state !== 'active') return;
        latestNative = undefined;
        forceUpload = true;
        requestSync();
      })
    : null;

  requestSync();
  return {
    synchronize: requestSync,
    stop(): void {
      active = false;
      pending = false;
      if (retryTimer) clearTimeout(retryTimer);
      tokenSubscription?.remove();
      stateSubscription?.remove();
    },
  };
}

/**
 * In-app notification feed, mounted at `/notifications` (customer surface).
 *
 * These are the notices the jobs domain records at each booking transition —
 * distinct from pushes, which deliver a banner. REST stays the source of truth:
 * the `notification:unread` realtime event only moves the home-screen bell pill,
 * and this API back-fills it.
 */
export const notificationsApi = {
  /** The customer's notices, newest first. */
  list: (options: { limit?: number } = {}) =>
    api.get<CustomerNotification[]>('/notifications', { query: { limit: options.limit ?? 20 } }),

  /** How many notices are still unread (the bell pill). */
  unreadCount: () => api.get<CustomerNotificationUnread>('/notifications/unread-count'),

  /** Acknowledges one notice as read; idempotent server-side. */
  markRead: (notificationId: string) =>
    api.post<undefined>(`/notifications/${notificationId}/read`),

  /** Marks every notice as read (called once when the customer leaves the inbox). */
  readAll: () => api.post<undefined>('/notifications/read-all'),

  /** Permanently removes one notice from the inbox. */
  remove: (notificationId: string) => api.delete<void>(`/notifications/${notificationId}`),
};

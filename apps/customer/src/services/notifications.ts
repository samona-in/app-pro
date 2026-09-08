import { Platform } from 'react-native';
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
}

/**
 * Requests permission and, if granted, registers the device's push token with
 * the server. Returns the token that was stored, or null if denied/absent.
 *
 * Called after sign-in. The server stores the token on the Customer's profile
 * and uses it to deliver chat-message pushes.
 */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  await ensureChannel();

  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted = request.granted;
  }
  if (!granted) return null;

  const isAndroid = Platform.OS === 'android';

  // Android registers the raw FCM registration token so the server can reach
  // Firebase directly with a display payload that survives the process being
  // dead. No Expo project id is needed for it.
  let pushToken: string;
  if (isAndroid) {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    pushToken = tokenData.data;
  } else {
    if (!PROJECT_ID) return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    pushToken = tokenData.data;
  }

  try {
    await api.post<undefined>('/notifications/register-token', {
      pushToken,
      platform: isAndroid ? 'android' : 'ios',
      provider: isAndroid ? 'fcm' : 'expo',
    } satisfies RegisterPushTokenInput);
    return pushToken;
  } catch (error) {
    // A push-token fetch or registration failure is non-fatal to sign-in.
    console.error('[Notifications] Push token registration failed:', error);
    return null;
  }
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
};

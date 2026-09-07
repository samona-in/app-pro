import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
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

/** The channel chat notification pushes are delivered on (Android). */
export const CHAT_CHANNEL = 'chat_messages';

/** EAS project id used to mint Expo push tokens (see the Pro app for the chain). */
const PROJECT_ID =
  env.easProjectId ?? Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHAT_CHANNEL, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    // Null = the system default notification sound. A bare string is treated as
    // a custom sound name and must be shipped via the expo-notifications plugin
    // `sounds` array, which chat notifications have no need for.
    sound: null,
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
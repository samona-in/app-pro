import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { AppNotification } from '@samona/types';
import type { RegisterPushTokenInput, PushSettingsInput } from '@samona/validation';
import { api } from './api';
import { env } from '@/env';

/**
 * Push notifications for the Pro app.
 *
 * The server is the single deliverer and writer of notification state; this
 * module only (a) asks the device for permission and its Expo push token and
 * (b) tells the server where to send. Foreground presentation is configured
 * here so an alert appears even while the app is open.
 */

/** How foreground pushes are presented: an alert with a sound, like a real job alert. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** The notification channel job alerts are delivered on (Android). */
export const JOB_ALERT_CHANNEL = 'job-alerts';

/**
 * The EAS project id used to mint Expo push tokens.
 *
 * `Constants.easConfig.projectId` is only populated by EAS cloud builds; a
 * locally-built APK (via `gradlew assembleRelease`) has it null. So we prefer
 * the statically-baked `EXPO_PUBLIC_EAS_PROJECT_ID`, then fall back to the
 * runtime constants for EAS cloud builds, then to expoConfig.extra.eas.projectId
 * (the same fallback chain `getExpoPushTokenAsync` uses internally).
 */
const PROJECT_ID =
  env.easProjectId ??
  Constants.easConfig?.projectId ??
  Constants.expoConfig?.extra?.eas?.projectId;

/**
 * Ensures the Android channel exists once. The server sets `channelId` to this
 * on every job alert so it raises as a full, audible alert rather than a silent
 * tray item.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(JOB_ALERT_CHANNEL, {
    name: 'Job alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'job_alert',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    // Bypass "do not disturb" so a sleeping pro still hears the alert.
    bypassDnd: true,
  });
}

/**
 * Requests permission and, if granted, registers the device's Expo push token
 * with the server. Returns the token that was stored, or null if denied/absent.
 *
 * Called after sign-in. The server stores the token on the Pro's profile and
 * uses it to deliver job-alert pushes.
 */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  console.log('[Notifications] Starting push token registration...');

  await ensureChannel();
  console.log('[Notifications] Android notification channel ensured');

  const settings = await Notifications.getPermissionsAsync();
  console.log('[Notifications] Current permission status:', settings.status);
  let granted = settings.granted;
  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted = request.granted;
    console.log('[Notifications] Permission request result:', request.status);
  }
  if (!granted) {
    console.log('[Notifications] Permission not granted — skipping push registration');
    return null;
  }

  // No project id means we cannot mint an Expo push token; skip registration.
  if (!PROJECT_ID) {
    console.log('[Notifications] No Expo project ID found — skipping push registration');
    return null;
  }

  console.log('[Notifications] Expo project ID:', PROJECT_ID);

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const pushToken = tokenData.data;
    console.log('[Notifications] Expo push token generated:', pushToken);

    console.log('[Notifications] Sending token to backend...');
    await api.post<undefined>('/notifications/register-token', { pushToken } satisfies RegisterPushTokenInput);
    console.log('[Notifications] Token successfully stored on backend');
    return pushToken;
  } catch (error) {
    // A push-token fetch or registration failure is non-fatal to sign-in.
    console.error('[Notifications] Push token registration failed:', error);
    return null;
  }
}

/**
 * Turns job alerts on or off for the current Pro.
 */
export async function setJobAlertsEnabled(jobAlertsEnabled: boolean): Promise<void> {
  await api.patch<{ jobAlertsEnabled: boolean }>('/notifications/settings', {
    jobAlertsEnabled,
  } satisfies PushSettingsInput);
}

/** The current Pro's notification history, newest first. */
export async function listNotifications(options: { limit?: number } = {}): Promise<AppNotification[]> {
  return api.get<AppNotification[]>('/notifications', { query: { limit: options.limit } });
}

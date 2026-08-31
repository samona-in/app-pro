import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { AppNotification } from '@samona/types';
import type { RegisterPushTokenInput, PushSettingsInput } from '@samona/validation';
import { api } from './api';

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

const PROJECT_ID = Constants.easConfig?.projectId;

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
    sound: 'default',
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

  await ensureChannel();

  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted = request.granted;
  }
  if (!granted) return null;

  // No project id means we cannot mint an Expo push token; skip registration.
  if (!PROJECT_ID) return null;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const pushToken = tokenData.data;
    await api.post<undefined>('/notifications/register-token', { pushToken } satisfies RegisterPushTokenInput);
    return pushToken;
  } catch {
    // A push-token fetch or registration failure is non-fatal to sign-in.
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

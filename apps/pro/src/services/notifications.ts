import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { AppNotification } from '@samona/types';
import type { RegisterPushTokenInput, PushSettingsInput } from '@samona/validation';
import { api } from './api';
import { env } from '@/env';
import { promptForFullScreenIntentOnce } from './full-screen-alert';
import {
  configureJobAlertModule,
  getNativeDeviceId,
  promptForOverlayPermissionOnce,
} from './overlay-alert';

/**
 * Push notifications for the Pro app.
 *
 * The server is the single deliverer and writer of notification state; this
 * module only (a) asks the device for permission and the device's push token
 * (raw FCM on Android so the server can deliver with per-job TTL, collapse keys
 * and display payloads; the Expo push service elsewhere) and (b) tells the
 * server where to send. Foreground presentation is configured here so an alert
 * appears even while the app is open.
 */

/**
 * How foreground pushes are presented: an alert with a sound, like a real job
 * alert. Job requests surface the same way in every app state — on Android the
 * native (FCM) overlay presents them regardless of foreground, and on iOS
 * (where no overlay exists) the system banner/list is the presentation, so the
 * handler always shows them while the app is open.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * The notification channel job alerts are delivered on (Android). Matches the
 * native `AlertNotifications.CHANNEL_ID` for the tray/overlay and the server's
 * `channelId` on every FCM push.
 */
export const JOB_ALERT_CHANNEL = 'incoming_jobs';

/**
 * The notification channel "customer cancelled your job" heads-ups are
 * delivered on (Android). Matches the native `job_cancelled` channel: MAX
 * importance so a screen-off device still wakes, silent by design — the long
 * repeating cancellation ring is owned by the native module, never the channel,
 * keeping its ~10s cap intact.
 */
export const CANCELLATION_CHANNEL = 'job_cancelled';

/**
 * The notification channel chat-message pushes are delivered on (Android).
 * Matches the server's `channelId` on every chat FCM push. Unlike the job-alert
 * channel, the `sound` key is deliberately omitted so the channel uses the
 * physical device's default notification sound.
 */
export const CHAT_CHANNEL = 'chat_messages_v2';

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
  env.easProjectId ?? Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

/**
 * Ensures the Android channels exist once. The server sets `channelId` to these
 * on every push:
 *  - `incoming_jobs` for job alerts, so a request raises as a full, audible
 *    alert rather than a silent tray item;
 *  - `chat_messages_v2` for chat, which has no `sound` key and therefore
 *    follows the device default notification sound. (The id is a bumped "v2" —
 *    the original `chat_messages` was created silent and Android never lets an
 *    app change an existing channel's sound, so the fresh id starts clean.)
 *  - `job_cancelled` for the silent "customer cancelled your job" heads-up
 *    (also created natively; kept here so the channel exists even on builds
 *    before the native module started creating it).
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
  await Notifications.setNotificationChannelAsync(CHAT_CHANNEL, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    // Omitting `sound` — not `sound: null`, which is silent — makes the channel
    // use the device's default notification sound.
    vibrationPattern: [0, 250, 250],
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(CANCELLATION_CHANNEL, {
    name: 'Job cancelled',
    importance: Notifications.AndroidImportance.MAX,
    // Deliberately silent with vibration off: the cancellation ring (a finite
    // repeating pulse) is owned by the native module and the cap is on the
    // ringing, never stretched by a channel-driven second buzz.
    sound: null,
    vibrationPattern: [],
    enableVibrate: false,
  });
}

/**
 * Requests permission and, if granted, registers the device's push token with
 * the server. Returns the token that was stored, or null if denied/absent.
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

  const isAndroid = Platform.OS === 'android';

  // Android registers the raw FCM registration token so the server can reach
  // Firebase directly with per-job ttl/collapseKey/tag and a display payload
  // that survives the process being dead. No Expo project id is needed for it.
  // The device id binds the minted single-use offer tokens to this exact
  // install, and the native overlay is pointed at this bundle's API so it can
  // redeem them without waiting for the app to load.
  let pushToken: string;
  let deviceId: string | null = null;
  if (isAndroid) {
    console.log('[Notifications] Using raw FCM device token');
    const tokenData = await Notifications.getDevicePushTokenAsync();
    pushToken = tokenData.data;
    await configureJobAlertModule();
    deviceId = (await getNativeDeviceId()) || null;
    console.log('[Notifications] Native overlay configured with device id');
  } else {
    // No project id means we cannot mint an Expo push token; skip registration.
    if (!PROJECT_ID) {
      console.log('[Notifications] No Expo project ID found — skipping push registration');
      return null;
    }
    console.log('[Notifications] Expo project ID:', PROJECT_ID);
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    pushToken = tokenData.data;
  }
  console.log('[Notifications] Push token generated:', pushToken);

  try {
    console.log('[Notifications] Sending token to backend...');
    await api.post<undefined>('/notifications/register-token', {
      pushToken,
      // The server shapes the payload per OS: Android job alerts carry a
      // display payload so FCM shows the alert even when the app is killed,
      // plus the job data for the full-screen ring whenever the app is running.
      platform: isAndroid ? 'android' : 'ios',
      provider: isAndroid ? 'fcm' : 'expo',
      ...(deviceId ? { deviceId } : {}),
    } satisfies RegisterPushTokenInput);
    console.log('[Notifications] Token successfully stored on backend');

    // Rapido-style: once the device is registered for alerts, offer the
    // Android 14+ full-screen role and (where the role is unavailable) the
    // "display over other apps" overlay permission. One-time, best-effort;
    // never blocks or re-loops.
    await Promise.all([promptForFullScreenIntentOnce(), promptForOverlayPermissionOnce()]);

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
export async function listNotifications(
  options: { limit?: number } = {},
): Promise<AppNotification[]> {
  return api.get<AppNotification[]>('/notifications', { query: { limit: options.limit } });
}

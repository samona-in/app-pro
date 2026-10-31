import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isApiError, isRetryable } from '@samona/api-client';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { AppNotification } from '@samona/types';
import type { RegisterPushTokenInput, PushSettingsInput } from '@samona/validation';
import { api } from './api';
import { env } from '@/env';
import { i18nInstance } from '@/i18n';
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
    name: i18nInstance.t('notifications.channels.jobAlerts'),
    importance: Notifications.AndroidImportance.MAX,
    sound: 'job_alert',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    // Bypass "do not disturb" so a sleeping pro still hears the alert.
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync(CHAT_CHANNEL, {
    name: i18nInstance.t('notifications.channels.messages'),
    importance: Notifications.AndroidImportance.HIGH,
    // Omitting `sound` — not `sound: null`, which is silent — makes the channel
    // use the device's default notification sound.
    vibrationPattern: [0, 250, 250],
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(CANCELLATION_CHANNEL, {
    name: i18nInstance.t('notifications.channels.jobCancelled'),
    importance: Notifications.AndroidImportance.MAX,
    // Deliberately silent with vibration off: the cancellation ring (a finite
    // repeating pulse) is owned by the native module and the cap is on the
    // ringing, never stretched by a channel-driven second buzz.
    sound: null,
    vibrationPattern: [],
    enableVibrate: false,
  });
}

const INSTALL_ID_KEY = 'samona.push-install-id';
const PENDING_UNREGISTER_KEY = 'samona.push-unregister-pending';

type StoredRegistration = { userId: string; deviceId: string };

async function getPushDeviceId(): Promise<string> {
  const nativeId = await getNativeDeviceId();
  if (nativeId) return nativeId;
  // Persist a unique launch id once for iOS / builds without the native module.
  // Android with the overlay always uses its native offer-redemption identity.
  const stored = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (stored) return stored;
  const id = Constants.sessionId;
  await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
  return id;
}

function tokenLabel(token: string): string {
  return token.length > 12 ? `…${token.slice(-6)}` : '[redacted]';
}

function logTokenEvent(message: string): void {
  // eslint-disable-next-line no-console -- Lifecycle messages contain redacted token identifiers only.
  console.log(`[Notifications] ${message}`);
}

// Serialize mutations across session changes too: an old in-flight upload must
// finish before a new account registers this installation.
let pushMutationQueue: Promise<unknown> = Promise.resolve();
function mutatePush<T>(operation: () => Promise<T>): Promise<T> {
  const result = pushMutationQueue.then(operation);
  pushMutationQueue = result.catch(() => undefined);
  return result;
}

/**
 * Owns one authenticated Pro's token lifecycle. Expo forwards the native FCM
 * onNewToken event through addPushTokenListener (including our subclassed job
 * alert service). Never fetch a native token from inside that callback.
 */
export function startPushTokenSync(userId: string, getAccessToken: () => Promise<string | null>) {
  let active = Platform.OS !== 'web';
  let latestNative: Notifications.DevicePushToken | undefined;
  let uploadedToken: string | null = null;
  let pending = false;
  let forceUpload = true;
  let running: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let permissionAsked = false;
  let offeredAlertPermissions = false;

  async function clearPendingLogout(accessToken: string): Promise<void> {
    const raw = await SecureStore.getItemAsync(PENDING_UNREGISTER_KEY);
    const stored = raw ? (JSON.parse(raw) as StoredRegistration) : null;
    if (stored?.userId !== userId) return;
    await api.post(
      '/notifications/unregister-token',
      { deviceId: stored.deviceId },
      {
        skipAuth: true,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 10000,
      },
    );
    await SecureStore.deleteItemAsync(PENDING_UNREGISTER_KEY);
    logTokenEvent('Completed pending device unregistration');
  }

  async function synchronize(): Promise<void> {
    const authenticated = await mutatePush(async () => {
      const accessToken = await getAccessToken();
      if (!active || !accessToken) return false;
      // Logout cleanup must also recover when notification permission was
      // subsequently revoked. It is independent of fetching a new token.
      await clearPendingLogout(accessToken);
      return true;
    });
    if (!authenticated || !active) return;
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
    // A newer event may have arrived while the native fetch was outstanding.
    if (latestNative && latestNative.data !== native.data) {
      pending = true;
      return;
    }
    latestNative = native;
    // The native fetch can emit this same token. That event is satisfied by
    // this upload and must not bypass backoff if the upload then fails.
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
    if (isAndroid) await configureJobAlertModule();
    const deviceId = await getPushDeviceId();
    const registration: RegisterPushTokenInput = {
      pushToken,
      deviceId,
      platform: isAndroid ? 'android' : 'ios',
      provider: isAndroid ? 'fcm' : 'expo',
    };
    await mutatePush(async () => {
      const accessToken = await getAccessToken();
      if (!active || !accessToken) return;
      await api.post('/notifications/register-token', registration, {
        skipAuth: true,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 10000,
      });
      uploadedToken = pushToken;
      attempt = 0;
      logTokenEvent(
        `Registered device token=${tokenLabel(pushToken)}, provider=${registration.provider}`,
      );
    });
    if (active && uploadedToken && !offeredAlertPermissions) {
      offeredAlertPermissions = true;
      await Promise.all([promptForFullScreenIntentOnce(), promptForOverlayPermissionOnce()]);
    }
  }

  function requestSync(): void {
    if (!active) return;
    pending = true;
    // Refresh events update latestNative while respecting an existing backoff
    // (including Retry-After). The scheduled upload will use the newest token.
    if (retryTimer) return;
    if (running) return;
    running = (async () => {
      while (active && pending) {
        pending = false;
        try {
          await synchronize();
        } catch (error) {
          uploadedToken = null;
          // API/provider errors may contain full tokens. Log status only.
          console.warn('[Notifications] Token synchronization failed', {
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
          // Preserve a new token/session event queued during a permanently
          // rejected upload. Native fetch events were already consumed above.
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
        logTokenEvent(`Native token refreshed, token=${tokenLabel(String(token.data))}`);
        requestSync();
      })
    : null;
  const appStateSubscription = active
    ? AppState.addEventListener('change', (state) => {
        if (state !== 'active' || !active) return;
        latestNative = undefined;
        forceUpload = true;
        requestSync();
      })
    : null;

  function stop(): void {
    active = false;
    pending = false;
    if (retryTimer) clearTimeout(retryTimer);
    tokenSubscription?.remove();
    appStateSubscription?.remove();
  }

  requestSync();
  return {
    stop,
    /** Called before Supabase sign-out while this user's bearer is still valid. */
    async unregister(): Promise<void> {
      stop();
      if (Platform.OS === 'web') return;
      try {
        const deviceId = await getPushDeviceId();
        await SecureStore.setItemAsync(
          PENDING_UNREGISTER_KEY,
          JSON.stringify({ userId, deviceId }),
        );
        // Queue behind actual uploads, without waiting for a stalled native
        // token fetch. Such a fetch checks active before it can upload later.
        await mutatePush(async () => {
          const accessToken = await getAccessToken();
          if (!accessToken) return;
          await clearPendingLogout(accessToken);
          logTokenEvent('Unregistered current device');
        });
      } catch {
        // Offline sign-out still works. Cleanup is retried before the next
        // login's upload; a different Pro login atomically reassigns the device.
        console.warn('[Notifications] Device unregistration pending network/session recovery');
      }
    },
    /** Refresh authentication without replacing listeners on every JWT renewal. */
    synchronize: requestSync,
  };
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

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireNativeModule } from 'expo-modules-core';
import { i18nInstance } from '@/i18n';
import { env } from '@/env';

/**
 * Android job-alert overlay + native store (Rapido-style).
 *
 * The `modules/job-alert` native side raises the Accept/Decline overlay over
 * any app, loops the alarm, and persists the alert metadata. When a push
 * carried a signed single-use offer token (bound to this install's native
 * device id), the overlay and tray redeem the job over the API by themselves —
 * no app launch required. When there is no token (legacy server / non-FCM),
 * the overlay records the choice and the in-app ring performs the authorized
 * call. This module is the thin JS bridge that configures the native side
 * (`configureJobAlertModule`, with the API base URL), hands back the per-install
 * device id for the push-token registration body (`getNativeDeviceId`), and
 * reads pending alerts/choices back so the in-app ring can also surface them.
 *
 * Every function degrades to a safe no-op when the native side is absent
 * (non-Android, or a stale APK that never bundled the module).
 */

/** A job alert the native side persisted for the app to surface. */
export interface PendingNativeJob {
  jobId: string;
  title: string;
  serviceName: string;
  serviceCategory: string | null;
  address: string | null;
  distanceMeters: string | null;
  amountPaise: string | null;
  expiresAt: string | null;
  professionalId: string | null;
  jobOfferToken: string | null;
  offerExpiresAt: string | null;
  receivedAt: number;
}

/** The accept/decline the pro picked on the native overlay. */
export interface PendingNativeAction {
  jobId: string;
  action: 'accept' | 'decline';
}

/**
 * A customer-initiated cancellation the native side recorded for a job the pro
 * was assigned to. `cancelledAt` is the server-stamped ISO timestamp shared by
 * the socket event and the FCM push, so both surfaces agree on one event.
 */
export interface NativeAssignedCancellation {
  jobId: string;
  cancelledAt: string;
}

interface OverlayAlertNativeModule {
  configure(apiUrl: string): Promise<boolean>;
  setLocale(locale: string): Promise<boolean>;
  getDeviceId(): Promise<string>;
  getPendingJobs(): Promise<PendingNativeJob[]>;
  consumePendingAction(): Promise<Record<string, never> | PendingNativeAction>;
  clearJobAlert(jobId: string): Promise<boolean>;
  setOverlaySuppressed(suppressed: boolean): Promise<boolean>;
  hasOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  presentCancellation(
    jobId: string,
    cancelledAt: string,
    showNotification: boolean,
  ): Promise<{ isNew: boolean }>;
  getCancellations(): Promise<NativeAssignedCancellation[]>;
  clearCancellation(jobId: string): Promise<boolean>;
}

/** The "already asked on this install" flag, so we never re-loop the settings sheet. */
const OVERLAY_PROMPTED_KEY = 'samona.overlay-permission-prompted';

function getNativeModule(): OverlayAlertNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<OverlayAlertNativeModule>('SamonaJobAlertBackground');
  } catch {
    // requireNativeModule throws when the native side is missing.
    return null;
  }
}

/** Alerts the native side persisted for jobs the JS layer has not surfaced yet. */
export async function getPendingNativeJobs(): Promise<PendingNativeJob[]> {
  const module = getNativeModule();
  if (!module) return [];
  try {
    return await module.getPendingJobs();
  } catch {
    return [];
  }
}

/**
 * Stable per-install device id minted natively and persisted on first use.
 * The same value must ride the push-token registration body so the server can
 * bind a minted offer token to this exact device (the overlay redeems it with
 * this id). Returns '' when the native side is absent.
 */
export async function getNativeDeviceId(): Promise<string> {
  const module = getNativeModule();
  if (!module) return '';
  try {
    return await module.getDeviceId();
  } catch {
    return '';
  }
}

/**
 * Points the native overlay/tray redeem calls at this bundle's API. Best
 * effort, called once at startup before a NEW_JOB push can realistically
 * arrive; without it, an overlay tap degrades to the legacy open-app fallback.
 * Also mirrors the active app language onto the native side (`setLocale`) so
 * tray/overlay strings (channel names, actions, countdown) match the UI, and
 * keeps it in sync whenever the user changes language in-session.
 */
export async function configureJobAlertModule(): Promise<void> {
  const module = getNativeModule();
  if (!module || !env.apiUrl) return;
  try {
    await module.configure(env.apiUrl);
  } catch {
    // Legacy APK without the module: safe fallback, nothing to configure.
  }
  if (!localeSyncRegistered) {
    localeSyncRegistered = true;
    i18nInstance.on('languageChanged', () => void setNativeLocale());
  }
  await setNativeLocale();
}

let localeSyncRegistered = false;

async function setNativeLocale(): Promise<void> {
  const module = getNativeModule();
  if (!module) return;
  try {
    await module.setLocale(i18nInstance.language);
  } catch {
    // Best-effort: a stale APK without `setLocale` keeps its own defaults.
  }
}

/**
 * Returns (and clears) the accept/decline the pro tapped on the native overlay
 * so the in-app ring can perform the secured API call. Android-only; resolves
 * null elsewhere or when nothing was recorded.
 */
export async function consumeNativePendingAction(): Promise<PendingNativeAction | null> {
  const module = getNativeModule();
  if (!module) return null;
  try {
    const action = await module.consumePendingAction();
    // The native side returns an empty object when nothing was recorded.
    if (!action || typeof action.jobId !== 'string') return null;
    return { jobId: action.jobId, action: action.action === 'decline' ? 'decline' : 'accept' };
  } catch {
    return null;
  }
}

/** Drops a job alert from native storage, overlay and tray (best-effort). */
export async function clearNativeJobAlert(jobId: string): Promise<void> {
  const module = getNativeModule();
  if (!module || !jobId) return;
  try {
    await module.clearJobAlert(jobId);
  } catch {
    // Best-effort: the native store self-heals on terminal pushes.
  }
}

/**
 * Route-aware suppression of the flat `SYSTEM_ALERT_WINDOW` banner. While the
 * pro is on the `incoming-jobs` route the floating alert is hidden (that screen
 * already lists every offer), but the offers and the alert ring stay governed
 * by the pending count, independent of the route. Android-only; clears/restores
 * the banner without touching stored offers.
 */
export async function setOverlaySuppressed(suppressed: boolean): Promise<void> {
  const module = getNativeModule();
  if (!module) return;
  try {
    await module.setOverlaySuppressed(suppressed);
  } catch {
    // Best-effort: without the native side there is no overlay to suppress.
  }
}

/** Whether "display over other apps" (the overlay permission) is granted. */
export async function isOverlayPermissionEnabled(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.hasOverlayPermission();
  } catch {
    return false;
  }
}

/** Opens the per-app "display over other apps" settings screen, when possible. */
export async function requestOverlayPermission(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.requestOverlayPermission();
  } catch {
    return false;
  }
}

/**
 * Records (if new) and presents a customer-initiated cancellation of an
 * assigned job. Returns whether the native side had not already raised it
 * (`isNew`) — the single deduplication anchor shared with the FCM push: the
 * first venue (socket or push) wins, the other no-ops. The native side starts
 * its finite repeating vibration on a new present; `showNotification` decides
 * whether it also posts the silent heads-up tray (false on the foreground
 * socket path — the JS modal is the foreground presentation).
 *
 * Android-only; resolves `{ isNew: false }` elsewhere or without the module.
 */
export async function presentNativeCancellation(
  jobId: string,
  cancelledAt: string,
  showNotification: boolean,
): Promise<{ isNew: boolean }> {
  const module = getNativeModule();
  if (!module || !jobId) return { isNew: false };
  try {
    return await module.presentCancellation(jobId, cancelledAt, showNotification);
  } catch {
    // Best-effort: without the native store the socket still drives the modal.
    return { isNew: false };
  }
}

/**
 * The unacknowledged customer cancellations the native store persists. Rehydrated
 * on mount and on every return to the active AppState, so an alert raised via a
 * push the JS layer never saw (killed process, screen off) still surfaces.
 */
export async function getNativeCancellations(): Promise<NativeAssignedCancellation[]> {
  const module = getNativeModule();
  if (!module) return [];
  try {
    return await module.getCancellations();
  } catch {
    return [];
  }
}

/**
 * Acknowledges a cancellation with the native side: stops the repeating
 * vibration, drops the tray entry and clears the persisted record so the pro
 * is never shown the same cancellation twice. Best-effort.
 */
export async function clearNativeCancellation(jobId: string): Promise<void> {
  const module = getNativeModule();
  if (!module || !jobId) return;
  try {
    await module.clearCancellation(jobId);
  } catch {
    // Best-effort: the modal still closes; the native record self-heals on the
    // next terminal push or fresh-raise of the same job.
  }
}

/**
 * One-time, best-effort prompt for "display over other apps" (Rapido-style).
 * Called after the first successful push-token registration; asking again on a
 * fresh install if the pro has not granted it, never looping within one. The
 * overlay tier is only a fallback for devices without the full-screen role, so
 * a refusal never blocks — readiness reports it as a missing setting instead.
 */
export async function promptForOverlayPermissionOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;

  if (await isOverlayPermissionEnabled()) return;

  const alreadyPrompted = (await SecureStore.getItemAsync(OVERLAY_PROMPTED_KEY)) === '1';
  if (alreadyPrompted) return;

  // Remember we asked BEFORE the sheet opens: a pro who leaves the settings
  // screen unresolved must not be nagged on the very next launch.
  await SecureStore.setItemAsync(OVERLAY_PROMPTED_KEY, '1');
  await requestOverlayPermission();
}

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireNativeModule } from 'expo-modules-core';

/**
 * Android job-alert overlay + native store (Rapido-style).
 *
 * The `modules/job-alert` native side raises the Accept/Decline overlay over
 * any app, loops the alarm, and persists the alert metadata + whatever action
 * the pro tapped while the app was not visible. This module is the thin JS
 * bridge that (a) reads those pending alerts back so the in-app ring can fetch
 * and enqueue each job, (b) consumes the recorded Accept/Decline so the app —
 * the only place the token exists — performs the secured API call, and (c)
 * exposes the "display over other apps" permission the overlay depends on.
 *
 * Every function degrades to a safe no-op when the native side is absent
 * (non-Android, or a stale APK that never bundled the module).
 */

/** A job alert the native side persisted for the app to surface. */
export interface PendingNativeJob {
  jobId: string;
  title: string;
  serviceName: string;
  address: string | null;
  distanceMeters: string | null;
  amountPaise: string | null;
  expiresAt: string | null;
  professionalId: string | null;
  receivedAt: number;
}

/** The accept/decline the pro picked on the native overlay. */
export interface PendingNativeAction {
  jobId: string;
  action: 'accept' | 'decline';
}

interface OverlayAlertNativeModule {
  getPendingJobs(): Promise<PendingNativeJob[]>;
  consumePendingAction(): Promise<Record<string, never> | PendingNativeAction>;
  clearJobAlert(jobId: string): Promise<boolean>;
  hasOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
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
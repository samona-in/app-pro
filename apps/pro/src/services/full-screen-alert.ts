import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireNativeModule } from 'expo-modules-core';

/**
 * Android full-screen job alerts (Rapido-style).
 *
 * The native side (`modules/job-alert`) owns the FCM service that actually
 * raises the alert over other apps. This module is the small JS bridge for the
 * one runtime knob Android 14+ introduced: the per-app "allow full screen"
 * permission, which the system gates behind the opaque
 * `Settings.MANAGE_APP_USE_FULL_SCREEN_INTENT` screen. There is no way to flip
 * it from code — a vendor must drive the user through that screen.
 *
 * Pre-14 devices need no runtime step: declaring USE_FULL_SCREEN_INTENT is an
 * install-time grant there, so the whole flow is a no-op.
 */

interface FullScreenIntentNativeModule {
  isAvailableAsync(): Promise<boolean>;
  requestAsync(): Promise<boolean>;
}

/** The "already asked on this install" flag, so we never re-loop the sheet. */
const PROMPTED_KEY = 'samona.full-screen-intent-prompted';

/**
 * Returns the native module, or null when it is unavailable (non-Android, or a
 * locally-built APK that was never prebuilt with the module). Every call site
 * degrades to the plain heads-up notification in that case.
 */
function getNativeModule(): FullScreenIntentNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<FullScreenIntentNativeModule>('SamonaFullScreenIntent');
  } catch {
    // requireNativeModule throws when the native side is missing.
    return null;
  }
}

/** Whether full-screen alerts are currently allowed on this device. */
export async function isFullScreenIntentEnabled(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Opens the system "full screen content" screen for this app, if possible. */
export async function requestFullScreenIntent(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.requestAsync();
  } catch {
    return false;
  }
}

/**
 * One-time, best-effort prompt (Rapido-style) for the Android 14+ full-screen
 * role. Called after the first successful push-token registration; asking again
 * on a fresh install if the pro has not granted it, never looping within one.
 */
export async function promptForFullScreenIntentOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;

  if (await isFullScreenIntentEnabled()) return;

  const alreadyPrompted = (await SecureStore.getItemAsync(PROMPTED_KEY)) === '1';
  if (alreadyPrompted) return;

  // Remember we asked BEFORE the sheet opens: a pro who leaves the settings
  // screen unresolved must not be nagged on the very next launch.
  await SecureStore.setItemAsync(PROMPTED_KEY, '1');
  await requestFullScreenIntent();
}
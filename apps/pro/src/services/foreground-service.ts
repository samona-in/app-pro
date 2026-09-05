import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import { subscribeToOnlineStatus } from './online-status-state';

/**
 * Mirrors the pro's online status onto the Android job-alert foreground
 * service (see the `job-alert` native module).
 *
 * While a pro is online the app must survive being backgrounded or swiped away,
 * otherwise the FCM process dies and NEW_JOB pushes can never raise the
 * full-screen ring. The native service keeps the process alive and shows the
 * Android-mandated persistent "online" notification. It is stopped the moment
 * the pro goes offline or signs out, so it never runs idle.
 *
 * Subscribing to the status store (which never imports back into this module)
 * also covers the cold-start case: a pro left online relaunches the app, the
 * profile reconcile flips the store to `online`, and this mirror restarts the
 * service without a manual toggle.
 */

interface JobAlertBackgroundModule {
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
}

/** The native module, or null when absent (non-Android, or a stale APK). */
function getNativeModule(): JobAlertBackgroundModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<JobAlertBackgroundModule>('SamonaJobAlertBackground');
  } catch {
    // requireNativeModule throws when the native side is missing.
    return null;
  }
}

/** Best-effort: starts the online foreground service (no-op off Android). */
export function startJobAlertService(): void {
  void getNativeModule()?.start();
}

/** Best-effort: stops the online foreground service (no-op off Android). */
export function stopJobAlertService(): void {
  void getNativeModule()?.stop();
}

let mirrorUnsubscribe: (() => void) | null = null;

/**
 * Hooks the online-status store to the native service. Call from the signed-in
 * surface; idempotent — each call replaces the previous subscription, so
 * re-running after a sign-out/re-login stays correct.
 */
export function initializeJobAlertService(): void {
  mirrorUnsubscribe?.();
  mirrorUnsubscribe = subscribeToOnlineStatus((state) => {
    if (state.status === 'online') {
      startJobAlertService();
    } else if (state.status === 'offline' && !state.isTransitioning) {
      stopJobAlertService();
    }
  });
}

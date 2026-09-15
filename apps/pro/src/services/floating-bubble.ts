import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

/**
 * The floating Samona icon for an online pro (see the `job-alert` native
 * module's `FloatingBubble`).
 *
 * The icon is owned by the native online foreground service, whose lifecycle is
 * already driven by the online mirror in `foreground-service.ts` — start on
 * `online`, stop on `offline`/sign-out. This module only *reconciles* it after
 * the overlay permission may have changed: the icon lives above other apps only
 * when the pro is online AND has granted "display over other apps", and the
 * native gate re-checks both on every reconciliation (app foreground,
 * device-setup "Check again"). A grant while online brings the icon up
 * immediately; a revocation takes it down — without ever looping the permission
 * screen.
 *
 * Every function degrades to a safe no-op when the native side is absent
 * (non-Android, or a stale APK that never bundled the module).
 */

interface FloatingBubbleNativeModule {
  reconcileBubble(): Promise<boolean>;
}

/** The native module, or null when absent (non-Android, or a stale APK). */
function getNativeModule(): FloatingBubbleNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<FloatingBubbleNativeModule>('SamonaJobAlertBackground');
  } catch {
    // requireNativeModule throws when the native side is missing.
    return null;
  }
}

/**
 * Re-checks the floating icon against the pro's real online state and the
 * overlay permission. Best-effort no-op elsewhere; the native side decides
 * whether anything actually shows.
 */
export async function reconcileFloatingBubble(): Promise<void> {
  const module = getNativeModule();
  if (!module) return;
  try {
    await module.reconcileBubble();
  } catch {
    // Best-effort: without the native side there is no bubble to reconcile.
  }
}

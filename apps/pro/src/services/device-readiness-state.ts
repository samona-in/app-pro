import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { isFullScreenIntentEnabled, isFullScreenIntentSupported } from './full-screen-alert';
import { isOverlayPermissionEnabled } from './overlay-alert';
import { readPowerState } from './device-readiness';
import { reconcileFloatingBubble } from './floating-bubble';

/**
 * Job-alert readiness on the device.
 *
 * A job alert is a push that cold-starts the app and raises a full-screen
 * intent. Whether that actually happens is decided partly by OS settings the
 * app cannot touch: notifications on, "show over other apps" (the Android 14+
 * full-screen role — and, on devices without it, the display-over-other-apps
 * permission the native overlay banner needs), battery set to unrestricted,
 * and background data on. A missing one silently swallows alerts while the app
 * is closed — the exact bug a pro cannot diagnose. This module measures each,
 * caches the result for the UI (mirroring `online-status-state`), and lets
 * `goOnline` hard-block a pro who would otherwise go online deaf.
 *
 * The overlay permission is measured but not part of [DEVICE_READINESS_KEYS]:
 * it is the fallback presentation tier that only matters when the full-screen
 * role is unavailable, so it must not block a pro whose full-screen alerts work.
 *
 * OEM sleep lists (Xiaomi autostart, OnePlus/Oppo/Vivo "do not sleep" lists,
 * Samsung sleeping apps) have no public API to measure, so they are surfaced as
 * an informational guide only — never as a blocking check.
 */

export interface DeviceReadiness {
  notificationsEnabled: boolean;
  fullScreenAlertsEnabled: boolean;
  /** "Display over other apps", the native overlay banner's permission. Non-blocking. */
  overlayPermissionEnabled: boolean;
  batteryOptimizationIgnored: boolean;
  backgroundDataAllowed: boolean;
}

export const DEVICE_READINESS_KEYS: readonly (keyof DeviceReadiness)[] = [
  'notificationsEnabled',
  'fullScreenAlertsEnabled',
  'batteryOptimizationIgnored',
  'backgroundDataAllowed',
];

/** True when every measurable setting is in place. */
export function isDeviceReady(readiness: DeviceReadiness): boolean {
  return DEVICE_READINESS_KEYS.every((key) => readiness[key]);
}

/** How many settings are out of place (0 when ready). */
export function missingReadinessCount(readiness: DeviceReadiness): number {
  return DEVICE_READINESS_KEYS.filter((key) => !readiness[key]).length;
}

async function checkNotificationPermission(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.granted;
  } catch {
    return false;
  }
}

/**
 * Re-runs every probe and returns the current state. On non-Android the checks
 * are a no-op — they exist to keep a push-delivered alert reachable, and iOS
 * needs no extra settings. `platform` is injectable so tests can exercise the
 * Android path without toggling a read-only native Platform object.
 */
export async function checkDeviceReadiness(
  platform: string = Platform.OS,
): Promise<DeviceReadiness> {
  if (platform !== 'android') {
    return {
      notificationsEnabled: true,
      fullScreenAlertsEnabled: true,
      overlayPermissionEnabled: true,
      batteryOptimizationIgnored: true,
      backgroundDataAllowed: true,
    };
  }

  const [notificationsEnabled, fullScreenAlertsEnabled, overlayPermissionEnabled, power] =
    await Promise.all([
      checkNotificationPermission(),
      // Only the full-screen module can measure the Android 14+ role; without it
      // there is nothing to block on, so an absent measurement reads as "on".
      isFullScreenIntentSupported() ? isFullScreenIntentEnabled() : Promise.resolve(true),
      isOverlayPermissionEnabled(),
      readPowerState(),
    ]);

  return {
    notificationsEnabled,
    fullScreenAlertsEnabled,
    overlayPermissionEnabled,
    batteryOptimizationIgnored: power.batteryOptimizationIgnored,
    backgroundDataAllowed: power.backgroundDataAllowed,
  };
}

type ReadinessListener = (readiness: DeviceReadiness | null) => void;

const listeners = new Set<ReadinessListener>();
let lastReadiness: DeviceReadiness | null = null;

export function subscribeToDeviceReadiness(listener: ReadinessListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDeviceReadiness(): DeviceReadiness | null {
  return lastReadiness;
}

/** Re-runs the probes and notifies subscribers with the fresh result. */
export async function refreshDeviceReadiness(): Promise<DeviceReadiness> {
  try {
    lastReadiness = await checkDeviceReadiness();
  } catch {
    // Leave the previous result (or null) in place; a failed probe is not new
    // information, so nothing is broadcast.
  }
  // The overlay permission probe above is exactly the moment the floating
  // Samona icon's gate may have flipped (a grant while online, a revocation).
  // Reconcile it here, where app foreground and device-setup "Check again"
  // both land; offline/no-permission is handled natively.
  void reconcileFloatingBubble();
  listeners.forEach((listener) => listener(lastReadiness));
  return (
    lastReadiness ?? {
      notificationsEnabled: true,
      fullScreenAlertsEnabled: true,
      overlayPermissionEnabled: true,
      batteryOptimizationIgnored: true,
      backgroundDataAllowed: true,
    }
  );
}

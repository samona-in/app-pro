import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

/**
 * Bridge to the Android job-alert readiness native module (`modules/device-readiness`).
 *
 * The native side performs the OS probes (battery optimization, background data)
 * and opens the exact settings screen a pro needs to fix each one. Everything
 * here degrades to "nothing to do" when the module is absent — a JS-only build
 * must never hard-block a pro over a value it could not measure.
 */

export interface DeviceReadinessPowerState {
  batteryOptimizationIgnored: boolean;
  backgroundDataAllowed: boolean;
}

interface DeviceReadinessNativeModule {
  isBatteryOptimizationIgnoredAsync(): Promise<boolean>;
  requestIgnoreBatteryOptimizationsAsync(): Promise<boolean>;
  isBackgroundDataAllowedAsync(): Promise<boolean>;
  openBackgroundDataSettingsAsync(): Promise<boolean>;
  openNotificationSettingsAsync(): Promise<boolean>;
  getManufacturer(): string;
}

function getNativeModule(): DeviceReadinessNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<DeviceReadinessNativeModule>('SamonaDeviceReadiness');
  } catch {
    return null;
  }
}

/**
 * Reads the power-savings probes. A missing native module or a failed probe
 * reads "all clear": these are measurement helpers for a user-configurable
 * gate, never a security control, so an unavailable measurement must not block.
 */
export async function readPowerState(): Promise<DeviceReadinessPowerState> {
  const module = getNativeModule();
  if (!module) return { batteryOptimizationIgnored: true, backgroundDataAllowed: true };
  try {
    const [batteryOptimizationIgnored, backgroundDataAllowed] = await Promise.all([
      module.isBatteryOptimizationIgnoredAsync(),
      module.isBackgroundDataAllowedAsync(),
    ]);
    return { batteryOptimizationIgnored, backgroundDataAllowed };
  } catch {
    return { batteryOptimizationIgnored: true, backgroundDataAllowed: true };
  }
}

/** Opens the system screen that exempts the app from battery optimization. */
export async function requestIgnoreBatteryOptimization(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.requestIgnoreBatteryOptimizationsAsync();
  } catch {
    return false;
  }
}

/** Opens this app's notification settings screen. */
export async function openNotificationSettings(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.openNotificationSettingsAsync();
  } catch {
    return false;
  }
}

/** Opens this app's background-data settings screen. */
export async function openBackgroundDataSettings(): Promise<boolean> {
  const module = getNativeModule();
  if (!module) return false;
  try {
    return await module.openBackgroundDataSettingsAsync();
  } catch {
    return false;
  }
}

/** OEM manufacturer string (e.g. "samsung", "xiaomi") — drives the setup guide. */
export function getDeviceManufacturer(): string {
  const module = getNativeModule();
  if (!module) return '';
  try {
    return module.getManufacturer();
  } catch {
    return '';
  }
}

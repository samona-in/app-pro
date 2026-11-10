import { Platform } from 'react-native';
import { requireNativeModule, type NativeModule } from 'expo-modules-core';
import type { AppUpdateInstallStatus } from './types';

/** Shape returned by the Kotlin module (`AppUpdatesModule`). */
export interface NativeAppUpdateInfo {
  status: string;
  availableVersionCode: number;
  updatePriority: number;
  stalenessDays: number | null;
  flexibleAllowed: boolean;
  immediateAllowed: boolean;
  installStatus: string;
  error?: string;
  message?: string;
}

export interface NativeInstallState {
  status: string;
  bytesDownloaded: number | null;
  totalBytesToDownload: number | null;
  installErrorCode: number;
}

export interface NativeFlexibleResult {
  started: boolean;
  reason?: string;
}

export type NativeImmediateResult = {
  status: string;
  reason?: string;
};

type AppUpdatesNativeEvents = {
  onInstallStateChanged: (state: NativeInstallState) => void;
  onUpdateFlowResult: (result: { updateType: string; status: string }) => void;
};

/**
 * `NativeModule` from expo-modules-core is the *constructor* type, so the
 * instance members (`addListener` and friends) come from `InstanceType`.
 */
export type AppUpdatesNativeModule = InstanceType<typeof NativeModule<AppUpdatesNativeEvents>> & {
  checkForUpdateAsync(): Promise<NativeAppUpdateInfo>;
  getInstallStateAsync(): Promise<NativeInstallState>;
  startFlexibleUpdateAsync(): Promise<NativeFlexibleResult>;
  startImmediateUpdateAsync(): Promise<NativeImmediateResult>;
  completeUpdateAsync(): Promise<boolean>;
};

let resolved = false;
let nativeModule: AppUpdatesNativeModule | null = null;

/**
 * Resolves the local Expo module exactly once.
 *
 * `null` is a normal, expected result: iOS, web, Expo Go, a JS-only test run
 * and a sideloaded build without the native module all reach this path. Every
 * caller degrades to "no update" instead of throwing, because an optional
 * update check must never block the app.
 */
export function getAppUpdatesNativeModule(): AppUpdatesNativeModule | null {
  if (Platform.OS !== 'android') return null;
  if (resolved) return nativeModule;

  resolved = true;
  try {
    nativeModule = requireNativeModule<AppUpdatesNativeModule>('SamonaAppUpdates');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

/** Maps the native status string onto the public union. */
export function normalizeInstallStatus(status: string | null | undefined): AppUpdateInstallStatus {
  switch (status) {
    case 'pending':
    case 'downloading':
    case 'installing':
    case 'installed':
    case 'downloaded':
    case 'failed':
    case 'canceled':
    case 'requiresUiIntent':
      return status;
    default:
      return 'unknown';
  }
}

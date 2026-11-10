import {
  getAppUpdatesNativeModule,
  normalizeInstallStatus,
  type NativeAppUpdateInfo,
} from '../native';
import type {
  AppUpdateAvailability,
  AppUpdateInfo,
  AppUpdateInstallState,
  StartFlexibleUpdateResult,
  StartImmediateUpdateResult,
} from '../types';

/**
 * All Google Play In-App Updates calls go through this service.
 *
 * Nothing here decides *when* to show the UI or *which* update type to offer —
 * that is the policy in `policy.ts` and the hook. Keeping the native calls in
 * one place means Customer and Pro can never drift apart, and a platform that
 * does not support Play updates (iOS, web) has a single, safe off-ramp.
 */

const UNSUPPORTED_INFO: AppUpdateInfo = {
  status: 'unsupported',
  availableVersionCode: 0,
  updatePriority: 0,
  stalenessDays: null,
  flexibleAllowed: false,
  immediateAllowed: false,
  installStatus: 'unknown',
};

const UNKNOWN_INSTALL_STATE: AppUpdateInstallState = {
  status: 'unknown',
  bytesDownloaded: null,
  totalBytesToDownload: null,
  installErrorCode: 0,
};

/** True only when the native Android module is present. */
export function isInAppUpdatesSupported(): boolean {
  return getAppUpdatesNativeModule() != null;
}

function normalizeAvailability(status: string | null | undefined): AppUpdateAvailability {
  switch (status) {
    case 'available':
    case 'notAvailable':
    case 'inProgress':
    case 'unsupported':
    case 'error':
      return status;
    default:
      return 'unknown';
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeInfo(raw: Partial<NativeAppUpdateInfo>): AppUpdateInfo {
  return {
    status: normalizeAvailability(raw.status),
    availableVersionCode: finiteNumber(raw.availableVersionCode),
    updatePriority: finiteNumber(raw.updatePriority),
    stalenessDays: nullableNumber(raw.stalenessDays),
    flexibleAllowed: raw.flexibleAllowed === true,
    immediateAllowed: raw.immediateAllowed === true,
    installStatus: normalizeInstallStatus(raw.installStatus),
    ...(typeof raw.error === 'string' ? { reason: raw.error } : {}),
    ...(typeof raw.message === 'string' && raw.message.length > 0 ? { message: raw.message } : {}),
  };
}

/**
 * Asks Play whether a newer `versionCode` exists. Never throws: a failed check
 * returns `status: 'error'` (or `'unsupported'` off Android) so callers can
 * simply do nothing.
 */
export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const native = getAppUpdatesNativeModule();
  if (native == null) return UNSUPPORTED_INFO;

  try {
    return normalizeInfo(await native.checkForUpdateAsync());
  } catch (error) {
    return {
      ...UNSUPPORTED_INFO,
      status: 'error',
      reason: 'unavailable',
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

/**
 * Re-reads a download that may have continued while the app was backgrounded
 * or killed. Play reports `downloaded` here so the UI can offer "Restart Now".
 */
export async function getAppUpdateInstallState(): Promise<AppUpdateInstallState> {
  const native = getAppUpdatesNativeModule();
  if (native == null) return UNKNOWN_INSTALL_STATE;

  try {
    const raw = await native.getInstallStateAsync();
    return {
      status: normalizeInstallStatus(raw.status),
      bytesDownloaded: nullableNumber(raw.bytesDownloaded),
      totalBytesToDownload: nullableNumber(raw.totalBytesToDownload),
      installErrorCode: finiteNumber(raw.installErrorCode),
    };
  } catch {
    return UNKNOWN_INSTALL_STATE;
  }
}

/** Starts Play's flexible flow. The download continues while the app is used. */
export async function startFlexibleUpdate(): Promise<StartFlexibleUpdateResult> {
  const native = getAppUpdatesNativeModule();
  if (native == null) return { started: false, reason: 'unsupported' };

  try {
    const result = await native.startFlexibleUpdateAsync();
    return {
      started: result.started === true,
      ...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
    };
  } catch {
    return { started: false, reason: 'unavailable' };
  }
}

/**
 * Starts Play's immediate flow. Resolves when the user accepts or declines;
 * on acceptance Play takes over the screen and restarts the app after install.
 */
export async function startImmediateUpdate(): Promise<StartImmediateUpdateResult> {
  const native = getAppUpdatesNativeModule();
  if (native == null) return { status: 'failed', reason: 'unsupported' };

  try {
    const result = await native.startImmediateUpdateAsync();
    switch (result.status) {
      case 'started':
        return { status: 'started' };
      case 'cancelled':
        return { status: 'cancelled' };
      case 'notAvailable':
        return { status: 'notAvailable' };
      case 'notAllowed':
        return { status: 'notAllowed' };
      case 'busy':
        return { status: 'busy' };
      default:
        return {
          status: 'failed',
          ...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
        };
    }
  } catch {
    return { status: 'failed', reason: 'unavailable' };
  }
}

/**
 * Installs a fully downloaded flexible update. Play shows its own full-screen
 * install UI and restarts the app afterwards.
 */
export async function completeAppUpdate(): Promise<boolean> {
  const native = getAppUpdatesNativeModule();
  if (native == null) return false;

  try {
    return (await native.completeUpdateAsync()) === true;
  } catch {
    return false;
  }
}

/** Subscribes to Play's install-progress stream. Returns an unsubscribe fn. */
export function subscribeToInstallState(
  listener: (state: AppUpdateInstallState) => void,
): () => void {
  const native = getAppUpdatesNativeModule();
  if (native == null) return () => {};

  const subscription = native.addListener('onInstallStateChanged', (raw) => {
    listener({
      status: normalizeInstallStatus(raw.status),
      bytesDownloaded: nullableNumber(raw.bytesDownloaded),
      totalBytesToDownload: nullableNumber(raw.totalBytesToDownload),
      installErrorCode: finiteNumber(raw.installErrorCode),
    });
  });
  return () => subscription.remove();
}

/** Subscribes to flow results (for example, a cancelled flexible consent). */
export function subscribeToUpdateFlowResult(
  listener: (result: { updateType: string; status: string }) => void,
): () => void {
  const native = getAppUpdatesNativeModule();
  if (native == null) return () => {};

  const subscription = native.addListener('onUpdateFlowResult', listener);
  return () => subscription.remove();
}

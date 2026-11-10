/**
 * Google Play in-app update domain types.
 *
 * These are intentionally independent of the native bridge: the service
 * normalises whatever the Play Core module returns into this shape, and every
 * screen/UI decision works against it.
 */

/** How Play should deliver the update. */
export type AppUpdateKind = 'flexible' | 'immediate';

/** Play's answer to "is a newer versionCode available?". */
export type AppUpdateAvailability =
  'available' | 'notAvailable' | 'inProgress' | 'unsupported' | 'error' | 'unknown';

/** Play Core's `InstallStatus`, normalised to strings for JS. */
export type AppUpdateInstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'installing'
  | 'installed'
  | 'downloaded'
  | 'failed'
  | 'canceled'
  | 'requiresUiIntent';

export interface AppUpdateInfo {
  status: AppUpdateAvailability;
  /** The Play Store version code, not the user-visible version name. */
  availableVersionCode: number;
  /** Play's in-app update priority for the release, 0–5. */
  updatePriority: number;
  /** Days since Play first offered this update, when Play reports it. */
  stalenessDays: number | null;
  flexibleAllowed: boolean;
  immediateAllowed: boolean;
  installStatus: AppUpdateInstallStatus;
  /** Stable native reason code when `status` is `error`. */
  reason?: string;
  message?: string;
}

export interface AppUpdateInstallState {
  status: AppUpdateInstallStatus;
  bytesDownloaded: number | null;
  totalBytesToDownload: number | null;
  installErrorCode: number;
}

export interface StartFlexibleUpdateResult {
  started: boolean;
  reason?: string;
}

export type StartImmediateUpdateResult =
  | { status: 'started' }
  | { status: 'cancelled' }
  | { status: 'notAvailable' }
  | { status: 'notAllowed' }
  | { status: 'busy' }
  | { status: 'failed'; reason?: string };

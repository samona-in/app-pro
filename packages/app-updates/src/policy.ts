import type { AppUpdateInfo, AppUpdateKind } from './types';

/**
 * Play's in-app update priority is an integer 0–5 set on the release through
 * the Play Developer API. Priority 4 and 5 are the documented "high priority"
 * band, so they map to the blocking immediate flow; everything else uses the
 * non-blocking flexible flow.
 *
 * This is the one place the release policy lives. Screens never choose
 * flexible vs immediate themselves.
 */
export const IMMEDIATE_UPDATE_PRIORITY = 4;

/**
 * Returns the update kind to offer, or `null` when there is nothing actionable
 * (no update, an unsupported build, or neither flow allowed on this device).
 *
 * Falls back to whichever flow Play actually allows: a device can disallow one
 * type (for example, an immediate flow on a low-storage device), and blocking
 * the prompt entirely would hide an available update for no reason.
 */
export function resolveUpdatePolicy(info: AppUpdateInfo | null): AppUpdateKind | null {
  if (info == null) return null;
  if (!info.flexibleAllowed && !info.immediateAllowed) return null;

  // An interrupted immediate update must be resumed, or the user is left on an
  // old build with no prompt. Play reports it as `inProgress`.
  if (info.status === 'inProgress') {
    return info.immediateAllowed ? 'immediate' : null;
  }
  if (info.status !== 'available') return null;

  if (info.updatePriority >= IMMEDIATE_UPDATE_PRIORITY && info.immediateAllowed) {
    return 'immediate';
  }
  if (info.flexibleAllowed) return 'flexible';
  return 'immediate';
}

/** Whether a flexible download is already on its way to the device. */
export function isDownloadInProgress(info: AppUpdateInfo | null): boolean {
  if (info == null) return false;
  return (
    info.installStatus === 'pending' ||
    info.installStatus === 'downloading' ||
    info.installStatus === 'installing'
  );
}

/**
 * Online status state — extracted so both online-status.ts and
 * job-notifications.ts can read the status without creating a cycle.
 *
 * A pro is in exactly one of three states:
 *  - `online`   — receiving job requests, can view/accept/deny jobs.
 *  - `offline`  — receiving nothing; must go online before seeing jobs.
 *  - `loading`  — the in-between transition while toggling, or an error.
 */

export type OnlineStatus = 'online' | 'offline' | 'loading';

export interface OnlineStatusState {
  status: OnlineStatus;
  error: string | null;
  isTransitioning: boolean;
}

type OnlineStatusListener = (state: OnlineStatusState) => void;

const listeners = new Set<OnlineStatusListener>();

let currentStatus: OnlineStatus = 'offline';
let currentError: string | null = null;
let isTransitioning = false;

/**
 * False until the online status has been confirmed by a user toggle or by the
 * server's profile. A fresh launch defaults the status to 'offline' only to
 * render a safe screen; it is NOT the server's truth. A job-alert push that
 * cold-starts the app arrives before this is reconciled, so alert handlers
 * must treat an unknown status as "not yet known", never as "offline".
 */
let currentStatusKnown = false;

export function notifyListeners(): void {
  listeners.forEach((listener) => {
    listener({
      status: currentStatus,
      error: currentError,
      isTransitioning,
    });
  });
}

export function setStatus(status: OnlineStatus, error: string | null = null): void {
  currentStatus = status;
  currentError = error;
  // A terminal status is the result of a user toggle or a server read, either
  // of which makes the status authoritative. 'loading' never resolves anything.
  if (status !== 'loading') currentStatusKnown = true;
  notifyListeners();
}

export function subscribeToOnlineStatus(listener: OnlineStatusListener): () => void {
  listeners.add(listener);
  listener({ status: currentStatus, error: currentError, isTransitioning });
  return () => listeners.delete(listener);
}

export function getOnlineStatus(): OnlineStatusState {
  return { status: currentStatus, error: currentError, isTransitioning };
}

export function isOnline(): boolean {
  return currentStatus === 'online';
}

/** True once the online status reflects the server's truth (or a user toggle). */
export function isOnlineStatusKnown(): boolean {
  return currentStatusKnown;
}

/**
 * Reconciles the in-memory online status with the server's authoritative value.
 *
 * The module's status starts as `offline` on every launch and only changes via
 * goOnline/goOffline, so on a fresh open it can disagree with the server
 * (e.g. a pro left online). This lets callers align with the server once the
 * profile loads — but it never clobbers an in-flight toggle, so mid-transition
 * the optimistic value wins until the API call settles.
 */
export function reconcileOnlineStatus(serverOnline: boolean): void {
  const status = getOnlineStatus().status;
  if (status === 'loading' || isTransitioning) return;
  const target: OnlineStatus = serverOnline ? 'online' : 'offline';
  if (status !== target) {
    setStatus(target);
  }
  // Even when the launch-time default already matches the server value, the
  // server has now confirmed it: the status is known, not a guess.
  currentStatusKnown = true;
}

export function isOffline(): boolean {
  return currentStatus === 'offline';
}

export function getIsTransitioning(): boolean {
  return isTransitioning;
}

export function setIsTransitioning(value: boolean): void {
  isTransitioning = value;
}

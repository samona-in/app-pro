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
  isTransitioning = status === 'loading';
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

export function isOffline(): boolean {
  return currentStatus === 'offline';
}

export function getIsTransitioning(): boolean {
  return isTransitioning;
}

export function setIsTransitioning(value: boolean): void {
  isTransitioning = value;
}

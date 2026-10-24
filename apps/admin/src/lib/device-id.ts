const STORAGE_KEY = 'samona.admin.deviceId';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stable per-browser identifier used as one of the login rate-limit buckets.
 *
 * It is not a security control on its own — a client can reset it — but it
 * makes the "3 failures then lock" rule harder to sidestep by clearing cookies
 * alone. The phone and IP buckets remain authoritative.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';

  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = createId();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

import { useEffect, useReducer } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { AppNotification } from '@samona/types';
import { useNotifications } from './use-notifications';

/**
 * The Pro notification rows carry no read flag (unlike the customer's notices),
 * so "unread" is a local watermark: the newest row the pro has actually opened.
 * It is persisted so the bell does not re-light every cold start.
 */
const STORAGE_KEY = 'samona.pro.notifications.lastSeenAt';

let lastSeenAt: string | null = null;
let hydrated = false;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function parse(value: string | null): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function hydrate(): Promise<void> {
  if (hydration) return hydration;
  hydration = SecureStore.getItemAsync(STORAGE_KEY)
    .then((stored) => {
      // A watermark advanced while the read was in flight must win over the
      // older persisted value.
      if (!hydrated) lastSeenAt = stored;
      hydrated = true;
    })
    .catch(() => {
      // A locked keychain must not keep the badge stuck on "everything unread".
      hydrated = true;
    })
    .finally(emit);
  return hydration;
}

/** The newest timestamp in a newest-first or arbitrary list; null when empty. */
export function latestNotificationAt(
  notifications: readonly Pick<AppNotification, 'createdAt'>[],
): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const notification of notifications) {
    const ms = parse(notification.createdAt);
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latest = notification.createdAt;
    }
  }
  return latest;
}

function countUnread(
  notifications: readonly Pick<AppNotification, 'createdAt'>[],
  seenAt: string | null,
): number {
  const seenMs = parse(seenAt);
  if (Number.isNaN(seenMs)) return notifications.length;
  return notifications.filter((notification) => {
    const ms = parse(notification.createdAt);
    return Number.isNaN(ms) || ms > seenMs;
  }).length;
}

/**
 * Advances the watermark to the newest notification the pro has seen. Only
 * moves forward, so opening the inbox twice cannot un-read anything.
 */
export async function markNotificationsSeen(createdAt: string | null): Promise<void> {
  if (!createdAt) return;
  const next = parse(createdAt);
  const current = parse(lastSeenAt);
  if (!Number.isNaN(current) && next <= current) return;

  lastSeenAt = createdAt;
  hydrated = true;
  emit();
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, createdAt);
  } catch {
    // The in-memory watermark still clears the badge for this session.
  }
}

/** Unread notifications for the Home bell. Zero until the watermark loads. */
export function useNotificationsUnread(): number {
  const { data } = useNotifications();
  const [, rerender] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const listener = () => rerender();
    listeners.add(listener);
    void hydrate();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return hydrated ? countUnread(data ?? [], lastSeenAt) : 0;
}

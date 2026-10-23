import type { CustomerNotification } from '@samona/types';

/** One day's slice of the notification feed, newest group first. */
export interface NotificationGroup {
  /** Stable local-day key, e.g. `2026-10-23`. */
  key: string;
  /** The heading above the slice: `Today`, `Yesterday` or `Wed, 21 Oct`. */
  label: string;
  items: CustomerNotification[];
}

/**
 * A local calendar day as a comparable integer.
 *
 * Comparing `Date.UTC(year, month, day)` instead of subtracting timestamps
 * keeps day boundaries right across DST shifts and keeps "yesterday" honest
 * when a notice landed late at night.
 */
function dayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The heading for a day: relative for the last two, a short date otherwise.
 * Rows use `formatNotificationTime` instead, so a row never repeats the day
 * its group heading already names.
 */
export function notificationDayLabel(date: Date, now: Date = new Date()): string {
  const diff = dayNumber(now) - dayNumber(date);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';

  const shortDate = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear ? shortDate : `${shortDate} ${date.getFullYear()}`;
}

/**
 * A row's timestamp, sized for the space beside the title.
 *
 * Today stays relative (`Now`, `12m`, `3h`) because that is what the customer
 * cares about inside a live booking; older days show the clock time, since the
 * group heading already carries the date.
 */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (dayNumber(date) !== dayNumber(now)) {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }

  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

/**
 * Splits the feed into day groups without reordering it (the API returns
 * newest first). A `Map` keeps the order of first appearance, so even if a
 * page ever interleaved days the same day still lands in one group.
 */
export function groupNotificationsByDay(
  notices: readonly CustomerNotification[],
  now: Date = new Date(),
): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();

  for (const notice of notices) {
    const date = new Date(notice.createdAt);
    const key = dayKey(date);
    const group = groups.get(key);

    if (group) {
      group.items.push(notice);
    } else {
      groups.set(key, { key, label: notificationDayLabel(date, now), items: [notice] });
    }
  }

  return [...groups.values()];
}

import type { TFunction } from 'i18next';

/** Formats small amounts of money; `—` when none is known yet. */
export function formatInr(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? '—' : `₹${amount.toLocaleString('en-IN')}`;
}

/** Formats a distance in kilometres for cards and detail rows. */
export function formatDistance(km: number | null | undefined, t: TFunction): string {
  if (km === null || km === undefined) return '—';
  // Keep one decimal for short distances; round everything beyond 10 km.
  const value = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return t('format.km', { value });
}

/** Formats an ETA in minutes. */
export function formatEta(minutes: number | null | undefined, t: TFunction): string {
  if (minutes === null || minutes === undefined) return '—';
  return t('format.minAway', { minutes: Math.round(minutes) });
}

/** Compact relative time, e.g. a marketplace post's age. */
export function formatRelativeTime(iso: string, t: TFunction): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return t('format.relative.justNow');
  if (minutes < 60) return t('format.relative.m', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('format.relative.h', { hours });
  return t('format.relative.d', { days: Math.floor(hours / 24) });
}

/** A chat timestamp as a short clock time, e.g. "4:32 PM". */
export function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** A file size in the smallest whole unit a person reads easily, e.g. "840 KB", "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}
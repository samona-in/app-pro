/** Formats small amounts of money; `—` when none is known yet. */
export function formatInr(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? '—' : `₹${amount.toLocaleString('en-IN')}`;
}

/** Formats a distance in kilometres for cards and detail rows. */
export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—';
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Formats an ETA in minutes. */
export function formatEta(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  return `${Math.round(minutes)} min away`;
}

/** Compact relative time, e.g. a marketplace post's age. */
export function formatRelativeTime(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
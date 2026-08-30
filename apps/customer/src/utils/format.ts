/** Formats rupees for cards and totals; `—` when none is known yet. */
export function formatInr(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? '—' : `₹${amount.toLocaleString('en-IN')}`;
}

/** Compact relative time, e.g. a booking list's age. */
export function formatRelativeTime(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
/**
 * Formats a paise amount as a whole Indian Rupee string.
 *
 * Amounts are stored as integer paise on the server (CLAUDE.md validates
 * money server-side); display is the only place a decimal emerges.
 */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** A chat timestamp as a short clock time, e.g. "4:32 PM". */
export function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** A booking date as in the list UI, e.g. "Sep 10, 2026". */
export function formatBookingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A job day with weekday, as in a completed booking, e.g. "Fri, 24 July 2026". */
export function formatJobDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** A clock time with leading zero and lowercase meridian, e.g. "09:23 am". */
export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const meridian = date.getHours() >= 12 ? 'pm' : 'am';
  return `${hours.toString().padStart(2, '0')}:${minutes} ${meridian}`;
}

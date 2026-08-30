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

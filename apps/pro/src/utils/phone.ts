import { formatPhoneForCall as formatPhoneForCallShared } from '@samona/validation';

export { formatPhoneForCallShared as formatPhoneForCall };
export { formatIndianPhoneNumber } from '@samona/validation';

/** The bits of a country entry that decide how a typed number is read. */
export interface DiallingPlan {
  /** ITU dial code without the plus, e.g. `91`. */
  dial: string;
  /** Longest subscriber number the country uses. */
  maxLocalDigits: number;
}

/**
 * Reduces what was typed or pasted into the local subscriber digits this
 * screen sends alongside the selected dial code.
 *
 * Three inputs arrive in practice and all must land on the same E.164 number:
 *   * `9876543210` — the normal case;
 *   * `09876543210` — the national trunk form, where India (and most of the
 *     list) writes a leading zero that E.164 does not carry. Sending it as-is
 *     produced `+910987654321`, which passes the generic phone check but is a
 *     different — undeliverable — number;
 *   * `+91 98765 43210` — a pasted full number, dial code included.
 *
 * Order matters: trunk zeros and the dial code are only stripped while the
 * number is longer than the country allows, so a genuine local number that
 * happens to begin with those digits is never mangled.
 */
export function toLocalDigits(value: string, country: DiallingPlan): string {
  let digits = value.replace(/\D/g, '');
  const dial = country.dial.replace(/\D/g, '');
  const max = country.maxLocalDigits;

  while (digits.length > max) {
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    } else if (dial && digits.startsWith(dial)) {
      digits = digits.slice(dial.length);
    } else {
      break;
    }
  }

  return digits.slice(0, max);
}

export function openTelLink(phone: string | null | undefined): string | null {
  const formatted = formatPhoneForCallShared(phone);
  if (!formatted) return null;
  return `tel:${formatted}`;
}

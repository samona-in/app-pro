import { createHmac } from 'node:crypto';

/**
 * PII-free phone helpers for OTP telemetry.
 *
 * A plain SHA-256 of a phone number is not anonymisation: the E.164 space is
 * small enough to enumerate. An HMAC keyed by a server-only secret is required
 * to make the digest useless to anyone who obtains the database.
 */

/** HMAC-SHA256(E.164) as lowercase hex. Deterministic, so rows can be joined. */
export function hashPhone(phone: string, secret: string): string {
  return createHmac('sha256', secret).update(phone.trim(), 'utf8').digest('hex');
}

/**
 * Last two digits of the number, for human support correlation.
 *
 * Two digits are enough to confirm "the number ending 42" with a user while
 * leaving far too little to reconstruct the number.
 */
export function phoneLast2(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-2).padStart(2, '0');
}

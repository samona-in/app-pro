import { createHash, createHmac } from 'node:crypto';
import { safeEqual } from '../common';

export interface TwilioJsonSignatureInput {
  authToken: string;
  /** Value of `X-Twilio-Signature`. */
  signature: string;
  /** Exact public URL Twilio signed, including its `bodySHA256` query value. */
  url: string;
  /** Raw request body, before JSON parsing or re-serialisation. */
  rawBody: string;
}

/**
 * Validates a JSON Twilio webhook.
 *
 * Twilio signs JSON callbacks differently from form posts: it appends a
 * `bodySHA256` query parameter (SHA-256 of the raw body) to the configured URL
 * and signs that complete URL with HMAC-SHA1 over the account auth token, with
 * no form parameters. Both checks are required —
 *
 *   1. the received body must hash to the advertised `bodySHA256`, and
 *   2. the signature must match HMAC-SHA1(authToken, full signed URL).
 *
 * Validation is deliberately local rather than via the `twilio` SDK: this one
 * function is the entire contract, it has no transitive dependencies, and it
 * can be tested without network access. The URL must be the URL configured in
 * Twilio, not one rebuilt from `Host`/`X-Forwarded-*`, because a proxy that
 * rewrites either would make every genuine callback fail.
 */
export function validateTwilioJsonSignature(input: TwilioJsonSignatureInput): boolean {
  const { authToken, signature, url, rawBody } = input;
  if (!authToken || !signature) return false;

  let bodyHash: string | null;
  try {
    bodyHash = new URL(url).searchParams.get('bodySHA256');
  } catch {
    return false;
  }
  // No body hash means this is not a JSON signed callback. Refusing is safer
  // than falling back to the form-encoded algorithm, which would compare
  // against different data entirely.
  if (!bodyHash) return false;

  const actualHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  if (!safeEqual(actualHash, bodyHash)) return false;

  const expected = createHmac('sha1', authToken).update(url, 'utf8').digest('base64');
  return safeEqual(signature, expected);
}

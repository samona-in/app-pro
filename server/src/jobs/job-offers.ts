import { createHash, createHmac, randomUUID } from 'node:crypto';
import { safeEqual } from '../common';

/**
 * Single-use job-offer tokens.
 *
 * A token is a compact signed blob: `base64url(payload).base64url(HMAC-SHA256(
 * secret, payload))`. The payload carries the pro the offer was minted for, the
 * job, the device it was bound to, and the expiry, so the server accepts the
 * token without a logged-in session. It is *not* a login credential — it can
 * only act on the one job it names, for the one pro, within a short window.
 *
 * Single-use is enforced by the `job_offers` table: the token is never stored,
 * only `SHA-256(token)` (tokenHash), and Accept/Reject flip that row from
 * unused to consumed atomically. The signature only proves the token was ours;
 * the ledger is what stops a replay.
 */

const TOKEN_VERSION = 1;
/** Upper bound on the authenticated signature, to bound work before verification. */
const MAX_SIGNATURE_LENGTH = 128;

export interface MintJobOfferInput {
  /** ProProfile.id the offer is minted for. */
  proId: string;
  /** Job.id the offer applies to. */
  jobId: string;
  /** ProProfile.pushDeviceId the offer is bound to (must be non-empty). */
  deviceId: string;
  /** Shared signing secret (JOB_OFFER_SECRET). */
  secret: string;
  /** How long the offer stays redeemable, in ms. */
  ttlMs: number;
  /** Injectable clock for tests. */
  now?: Date;
}

export interface MintedJobOffer {
  /** The signed token to deliver inside the push payload. */
  token: string;
  /** SHA-256 of `token`, the single-use ledger key. */
  tokenHash: string;
  expiresAt: Date;
}

export interface VerifiedJobOffer {
  proId: string;
  jobId: string;
  deviceId: string;
  expiresAt: Date;
}

/** Signs and wraps a fresh offer. Never call for an already-signed token. */
export function mintJobOffer(input: MintJobOfferInput): MintedJobOffer {
  const nowMs = input.now?.getTime() ?? Date.now();
  const expiresAt = new Date(nowMs + input.ttlMs);
  const payload = {
    v: TOKEN_VERSION,
    sub: input.proId,
    jid: input.jobId,
    dev: input.deviceId,
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: Math.floor(nowMs / 1000),
    iid: randomUUID(),
  };
  const encoded = base64url(JSON.stringify(payload));
  const token = `${encoded}.${sign(encoded, input.secret)}`;
  return { token, tokenHash: hashJobOfferToken(token), expiresAt };
}

/**
 * Verifies a token's signature integrity and expiry and returns its claims, or
 * null when the token is forged, truncated, expired or malformed. Callers must
 * still consult the `job_offers` ledger for single-use enforcement.
 */
export function verifyJobOffer(
  token: string,
  secret: string,
  now?: Date,
): VerifiedJobOffer | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (signature.length === 0 || signature.length > MAX_SIGNATURE_LENGTH) return null;
  if (!safeEqual(sign(encoded, secret), signature)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.v !== TOKEN_VERSION) return null;
  if (typeof p.sub !== 'string' || p.sub === '') return null;
  if (typeof p.jid !== 'string' || p.jid === '') return null;
  if (typeof p.dev !== 'string' || p.dev === '') return null;
  if (typeof p.exp !== 'number' || !Number.isFinite(p.exp)) return null;
  const expMs = p.exp * 1000;
  if (expMs <= (now?.getTime() ?? Date.now())) return null;
  return { proId: p.sub, jobId: p.jid, deviceId: p.dev, expiresAt: new Date(expMs) };
}

/** SHA-256 of a token; the only identity the server stores for it. */
export function hashJobOfferToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function base64url(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}
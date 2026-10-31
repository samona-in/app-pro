import { createSign } from 'node:crypto';
import { logger } from '../common/logger';
import { pushTokenId } from './push-token';

/**
 * Minimal Firebase Cloud Messaging HTTP v1 client.
 *
 * Deliberately dependency-free: the service-account private key is OAuth-signed
 * with `node:crypto` (RS256), the OAuth token is exchanged with a plain form
 * POST, and the message is sent with the runtime `fetch`. There is no need to
 * pull in `firebase-admin` and its transitive baggage for one endpoint. All of
 * it is optional — when the credentials are absent the notifications domain
 * records rows without attempting delivery (same contract as the Expo token).
 */

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface FcmAndroidNotification {
  channelId?: string;
  sound?: string;
  /** Groups a notification by job so repeats replace rather than stack. */
  tag?: string;
}

export interface FcmMessagePayload {
  /** Data key/value pairs; values must be strings. */
  data: Record<string, string>;
  /** Display notification, rendered even when the app process is dead. */
  notification?: {
    title: string;
    body: string;
  };
  /** Android delivery options. */
  android?: {
    priority?: 'normal' | 'high';
    /** How long the message stays deliverable before being dropped, in ms. */
    ttl?: string;
    /** Collapses queued duplicates for the same token into one message. */
    collapseKey?: string;
    notification?: FcmAndroidNotification;
  };
}

export interface FcmSendResult {
  ok: boolean;
  /** The FCM message name when the send succeeded. */
  messageId?: string;
  /** A client-safe error description when it failed. */
  error?: string;
  /** Structured provider code, independent of the HTTP status. */
  errorCode?: string;
  /** Only a token-specific permanent rejection permits deleting a token. */
  invalidToken?: boolean;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = (projectId: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

/**
 * Normalises an env-supplied private key. PEMs are typically pasted with literal
 * `\n` escapes; a raw value with real newlines is passed through untouched.
 */
function normalisePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * Signs a JWT bearer assertion for a service account and exchanges it for a
 * short-lived OAuth access token, caching it until ~5 minutes before expiry.
 */
export function createFcmClient(credentials: FcmCredentials) {
  const privateKey = normalisePrivateKey(credentials.privateKey);

  let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

  function signJwt(issuedAtSeconds: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: credentials.clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: TOKEN_URL,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + 3600,
      }),
    ).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    signer.end();
    const signature = signer.sign(privateKey, 'base64url');
    return `${header}.${claims}.${signature}`;
  }

  async function getAccessToken(): Promise<string | null> {
    if (cachedToken && Date.now() < cachedToken.expiresAtMs - 5 * 60_000) {
      return cachedToken.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwt(now);

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });
    } catch {
      logger.error('[FCM] OAuth token exchange failed (network).');
      return null;
    }

    if (!response.ok) {
      logger.error(`[FCM] OAuth token exchange failed (HTTP ${response.status}).`);
      return null;
    }

    const parsed = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) return null;

    cachedToken = {
      accessToken: parsed.access_token,
      expiresAtMs: Date.now() + (parsed.expires_in ?? 3600) * 1000,
    };
    return cachedToken.accessToken;
  }

  /**
   * Sends one message to a registration token and returns whether FCM accepted
   * it. Throws only on unexpected internal issues; provider rejections resolve
   * as `{ ok: false, error }`.
   */
  async function send(token: string, message: FcmMessagePayload): Promise<FcmSendResult> {
    if (!token || /^(ExponentPushToken|ExpoPushToken)\[/.test(token)) {
      logger.warn(`[FCM] Rejected non-native token ${pushTokenId(token)} before delivery.`);
      return { ok: false, error: 'Direct FCM delivery requires a native FCM registration token.' };
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { ok: false, error: 'Could not mint an FCM access token.' };
    }

    let response: Response;
    try {
      response = await fetch(SEND_URL(credentials.projectId), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: { token, ...message } }),
      });
    } catch {
      logger.error(`[FCM] Message send failed (network), token=${pushTokenId(token)}.`);
      return { ok: false, error: 'FCM send failed (network).' };
    }

    if (response.ok) {
      const parsed = (await response.json().catch(() => null)) as { name?: string } | null;
      logger.info(`[FCM] Accepted by Firebase, token=${pushTokenId(token)}.`, {
        messageId: parsed?.name ?? null,
        type: message.data.type ?? null,
        display: message.notification !== undefined,
        channelId: message.android?.notification?.channelId ?? null,
      });
      return { ok: true, messageId: parsed?.name };
    }

    const parsed = (await response.json().catch(() => null)) as {
      error?: { status?: string; details?: { '@type'?: string; errorCode?: string }[] };
    } | null;
    const details = parsed?.error?.details;
    const code =
      (Array.isArray(details) ? details : []).find(
        (detail) => detail?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
      )?.errorCode ?? parsed?.error?.status;
    const errorCode = typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : undefined;
    const invalidToken = errorCode === 'UNREGISTERED';
    // Provider messages can echo the rejected token. Log only structured codes.
    logger.warn(
      `[FCM] Message rejected, token=${pushTokenId(token)}, HTTP=${response.status}, code=${errorCode ?? 'UNKNOWN'}.`,
    );
    return {
      ok: false,
      errorCode,
      invalidToken,
      error: `FCM rejected the message (HTTP ${response.status}, ${errorCode ?? 'UNKNOWN'}).`,
    };
  }

  return { send };
}

export type FcmClient = ReturnType<typeof createFcmClient>;

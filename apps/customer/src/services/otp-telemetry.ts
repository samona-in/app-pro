import { Platform } from 'react-native';
import type { AppType } from '@samona/config';

/**
 * OTP attempt telemetry — the client half.
 *
 * Supabase Auth sends the code through Twilio Verify, and Twilio reports what
 * happened to it (sent, delivered, undelivered, failed) to the API. This call
 * says "the customer just requested a code, from this handset", so a later
 * callback can be attributed to a device instead of sitting as an orphan row.
 *
 * Rules this module keeps, because it runs in the middle of a sign-in:
 *   * it never blocks or fails the sign-in — every caller fires and forgets;
 *   * it never sends the OTP or logs the phone number;
 *   * it is bounded by a short timeout so a stalled uplink cannot leave a
 *     request hanging for the app's whole session.
 */

/** Registration is opportunistic; four seconds is generous for a small POST. */
const REGISTRATION_TIMEOUT_MS = 4_000;

interface DeviceInfo {
  manufacturer?: string;
  model?: string;
  osVersion?: string;
}

/**
 * Handset metadata for delivery triage.
 *
 * Manufacturers' SMS stacks (Vivo/iQOO in particular) behave differently from
 * stock Android, so knowing the model is often the difference between a
 * carrier problem and a device one. `Platform.constants` is used rather than
 * `expo-device` so this needs no extra dependency; every field is optional and
 * read defensively because the shape differs by platform and RN version.
 */
function deviceInfo(): DeviceInfo {
  const constants = Platform.constants as unknown as Record<string, unknown> | undefined;

  const stringValue = (key: string): string | undefined => {
    const value = constants?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  };

  const version =
    Platform.OS === 'android'
      ? stringValue('Release')
      : typeof Platform.Version === 'string'
        ? Platform.Version
        : undefined;

  return {
    // Brand is the marketing name (iQOO, Vivo); Manufacturer can be the parent
    // company (vivo). Prefer the more specific one but keep a fallback.
    manufacturer: stringValue('Manufacturer') ?? stringValue('Brand'),
    model: stringValue('Model'),
    osVersion: version,
  };
}

/**
 * A per-request idempotency key. The server upserts on it, so a retry of the
 * same registration cannot create a second attempt row. Timestamp first keeps
 * the value sortable when reading logs; the suffix only has to be unique, not
 * unguessable — it grants nothing.
 */
function newClientAttemptId(): string {
  return `otp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Registers a code request, best-effort.
 *
 * Resolves either way; callers should not `await` it in a way that delays the
 * code. Failures are logged as a status in development and otherwise dropped,
 * because a telemetry outage must be invisible to the person signing in.
 */
export async function registerOtpAttempt(phone: string, app: AppType): Promise<void> {
  // Unit tests render the auth hook without a network, and a fire-and-forget
  // POST would leak an open request into the test run. Telemetry is not part
  // of what those tests assert, so it is skipped rather than mocked everywhere.
  if (process.env.NODE_ENV === 'test') return;

  try {
    // Imported here rather than at module scope: this module is pulled in by
    // the auth hook, and a static import would construct the API client (and
    // read the environment) on every test that renders the hook.
    const { api } = await import('@/services/api');

    const response = await api.post<{ attemptId: string | null }>(
      '/auth/otp-attempts',
      {
        phone,
        app,
        clientAttemptId: newClientAttemptId(),
        device: deviceInfo(),
      },
      // Unauthenticated by nature: the caller is not signed in yet.
      { skipAuth: true, timeoutMs: REGISTRATION_TIMEOUT_MS },
    );

    if (__DEV__ && response?.attemptId) {
      // The id is the join key to the server's delivery events; the phone and
      // code are deliberately absent.
      // eslint-disable-next-line no-console
      console.info('[otp-telemetry] attempt registered', { attemptId: response.attemptId });
    }
  } catch (error) {
    if (__DEV__) {
      const status =
        typeof error === 'object' && error !== null
          ? (error as { status?: unknown }).status
          : undefined;
      console.warn('[otp-telemetry] registration failed', {
        status: typeof status === 'number' ? status : undefined,
      });
    }
  }
}

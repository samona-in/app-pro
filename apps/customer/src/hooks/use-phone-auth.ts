import { useCallback, useState } from 'react';
import { supabase } from '@/services/supabase';

const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a minute before requesting another code.';
const INCORRECT_CODE = 'Incorrect code. Please try again.';
const CONNECTION_LOST = 'Connection lost. Check your network and try again.';

/**
 * Supabase reports a wrong, reused or stale OTP as "Token has expired or is
 * invalid". Wording like that talks about internals the customer cannot act
 * on, so it is never echoed — a code problem is always shown as a code problem.
 *
 * Matching on the message (rather than only on `instanceof AuthError`) also
 * covers errors that arrive as a plain object: the two copies of Supabase's
 * client in a monorepo do not always share a constructor, which would make an
 * `instanceof` check silently fail and leak the raw text.
 */
const INTERNAL_COPY_PATTERN = /token|otp|jwt|expired|supabase/i;

/**
 * Infrastructure failures (a restricted/paused project, a bad or stale API
 * key, an upstream 5xx) are not something a customer can act on. Their raw
 * wording names quotas and dashboards, so it is replaced with the ordinary
 * "try again" copy instead of being echoed.
 */
const INFRASTRUCTURE_COPY_PATTERN =
  /quota|restricted|violation|upgrade|spend cap|service unavailable|bad gateway|internal server/i;

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function isRateLimited(error: unknown): boolean {
  return statusOf(error) === 429 || /rate limit|too many/i.test(messageOf(error));
}

/**
 * Requests that never reached Supabase (offline, weak signal, a stalled
 * fetch) arrive without an HTTP status and say so in the message. They are
 * not code problems, so they get connection advice instead.
 */
function isConnectionProblem(error: unknown): boolean {
  return (
    statusOf(error) === undefined &&
    /network|fetch|timeout|connection|offline/i.test(messageOf(error))
  );
}

function friendlyMessage(error: unknown, fallback: string): string {
  if (isRateLimited(error)) return TOO_MANY_ATTEMPTS;
  if (isConnectionProblem(error)) return CONNECTION_LOST;

  // A 401/402/403 or 5xx, or wording that talks about project limits, is an
  // infrastructure problem rather than a bad number the customer can fix.
  const message = messageOf(error);
  const status = statusOf(error);
  const serviceProblem =
    (status !== undefined &&
      (status === 401 || status === 402 || status === 403 || status >= 500)) ||
    INFRASTRUCTURE_COPY_PATTERN.test(message);

  return message && !serviceProblem && !INTERNAL_COPY_PATTERN.test(message) ? message : fallback;
}

/**
 * Developer breadcrumb for a failed request. Logs only the HTTP status and
 * Supabase error code — never the phone number, the OTP or a raw provider
 * message, either of which can carry customer data.
 */
function logAuthFailure(action: 'send' | 'verify', error: unknown) {
  if (!__DEV__) return;
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  console.warn(`[phone-auth] ${action} failed`, {
    status: statusOf(error),
    code: typeof code === 'string' ? code : undefined,
  });
}

/** Verification only ever reports a wrong code, a rate limit or a lost connection. */
function verifyMessage(error: unknown): string {
  if (isRateLimited(error)) return TOO_MANY_ATTEMPTS;
  if (isConnectionProblem(error)) return CONNECTION_LOST;
  return INCORRECT_CODE;
}

export function usePhoneAuth() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = useCallback(async (phone: string): Promise<boolean> => {
    setIsBusy(true);
    setError(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });

      if (otpError) {
        logAuthFailure('send', otpError);
        setError(friendlyMessage(otpError, 'Could not send a code. Please try again.'));
        return false;
      }
      return true;
    } catch (unexpected) {
      logAuthFailure('send', unexpected);
      setError(friendlyMessage(unexpected, 'Could not send a code. Please try again.'));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const verifyCode = useCallback(async (phone: string, token: string): Promise<boolean> => {
    setIsBusy(true);
    setError(null);

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (verifyError) {
        logAuthFailure('verify', verifyError);
        setError(verifyMessage(verifyError));
        return false;
      }
      if (!data.session) {
        setError('That code did not complete sign-in. Please request a new one.');
        return false;
      }
      return true;
    } catch (unexpected) {
      logAuthFailure('verify', unexpected);
      setError(verifyMessage(unexpected));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { sendCode, verifyCode, isBusy, error, clearError: () => setError(null) };
}

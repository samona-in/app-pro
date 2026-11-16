import { useCallback, useState } from 'react';
import { supabase } from '@/services/supabase';
import { i18nInstance } from '@/i18n';

/**
 * Phone sign-in and sign-up as one flow.
 *
 * Supabase treats both as the same operation: `signInWithOtp` creates the user
 * if the number is new, so a professional never has to know whether they
 * already have an account.
 *
 * Supabase performs the verification and owns the OTP entirely — no code or
 * credential is ever sent to the SAMONA API.
 */

/**
 * Supabase reports a wrong, reused or stale OTP as "Token has expired or is
 * invalid". That is internal wording a professional cannot act on, so it is
 * never echoed — a code problem is always shown as a code problem.
 *
 * Matching the message (not only `instanceof AuthError`) also covers errors
 * that arrive as a plain object, where a duplicated Supabase client in a
 * monorepo can make an `instanceof` check fail and leak the raw text.
 */
const INTERNAL_COPY_PATTERN = /token|otp|jwt|expired|supabase/i;

/**
 * Infrastructure failures (a restricted/paused project, a bad or stale API
 * key, an upstream 5xx) are not something a professional can act on. Their raw
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
  if (isRateLimited(error)) return i18nInstance.t('phone.tooManyAttempts');
  if (isConnectionProblem(error)) return i18nInstance.t('phone.noConnection');

  // A 401/402/403 or 5xx, or wording that talks about project limits, is an
  // infrastructure problem rather than a bad number the professional can fix.
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
  if (isRateLimited(error)) return i18nInstance.t('phone.tooManyAttempts');
  if (isConnectionProblem(error)) return i18nInstance.t('phone.noConnection');
  return i18nInstance.t('phone.wrongCode');
}

export function usePhoneAuth() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Sends an OTP to the given E.164 number. Returns true when one is on its way. */
  const sendCode = useCallback(async (phone: string): Promise<boolean> => {
    setIsBusy(true);
    setError(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone,
        // Creating the user here is what makes sign-in and sign-up one flow.
        options: { shouldCreateUser: true },
      });

      if (otpError) {
        logAuthFailure('send', otpError);
        setError(friendlyMessage(otpError, i18nInstance.t('phone.couldNotSend')));
        return false;
      }
      return true;
    } catch (unexpected) {
      logAuthFailure('send', unexpected);
      setError(friendlyMessage(unexpected, i18nInstance.t('phone.couldNotSend')));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  /**
   * Verifies the OTP.
   *
   * On success the Supabase client persists the session and emits an auth
   * event; the app's session state follows from that, so there is nothing to
   * return but success.
   */
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
        setError(i18nInstance.t('phone.signInIncomplete'));
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

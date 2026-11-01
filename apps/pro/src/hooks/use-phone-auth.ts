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

function friendlyMessage(error: unknown, fallback: string): string {
  if (isRateLimited(error)) return i18nInstance.t('phone.tooManyAttempts');

  const message = messageOf(error);
  return message && !INTERNAL_COPY_PATTERN.test(message) ? message : fallback;
}

/** Verification only ever reports a wrong code (or a rate limit). */
function verifyMessage(error: unknown): string {
  return isRateLimited(error)
    ? i18nInstance.t('phone.tooManyAttempts')
    : i18nInstance.t('phone.wrongCode');
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
        setError(friendlyMessage(otpError, i18nInstance.t('phone.couldNotSend')));
        return false;
      }
      return true;
    } catch (unexpected) {
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
        setError(verifyMessage(verifyError));
        return false;
      }
      if (!data.session) {
        setError(i18nInstance.t('phone.signInIncomplete'));
        return false;
      }
      return true;
    } catch (unexpected) {
      setError(verifyMessage(unexpected));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { sendCode, verifyCode, isBusy, error, clearError: () => setError(null) };
}
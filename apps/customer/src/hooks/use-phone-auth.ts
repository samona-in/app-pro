import { useCallback, useState } from 'react';
import { supabase } from '@/services/supabase';

const TOO_MANY_ATTEMPTS =
  'Too many attempts. Please wait a minute before requesting another code.';
const INCORRECT_CODE = 'Incorrect code. Please try again.';

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
  if (isRateLimited(error)) return TOO_MANY_ATTEMPTS;

  const message = messageOf(error);
  return message && !INTERNAL_COPY_PATTERN.test(message) ? message : fallback;
}

/** Verification only ever reports a wrong code (or a rate limit). */
function verifyMessage(error: unknown): string {
  return isRateLimited(error) ? TOO_MANY_ATTEMPTS : INCORRECT_CODE;
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
        setError(friendlyMessage(otpError, 'Could not send a code. Please try again.'));
        return false;
      }
      return true;
    } catch (unexpected) {
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
        setError(verifyMessage(verifyError));
        return false;
      }
      if (!data.session) {
        setError('That code did not complete sign-in. Please request a new one.');
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

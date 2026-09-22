import { useCallback, useState } from 'react';
import { AuthError } from '@supabase/supabase-js';
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
function friendlyMessage(error: unknown, fallback: string): string {
  if (error instanceof AuthError) {
    // Supabase messages are user-facing, but the rate-limit one is worth
    // rewording: the raw text mentions internals a pro should not see.
    if (error.status === 429) {
      return i18nInstance.t('phone.tooManyAttempts');
    }
    return error.message || fallback;
  }
  return fallback;
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
        setError(friendlyMessage(verifyError, i18nInstance.t('phone.wrongCode')));
        return false;
      }
      if (!data.session) {
        setError(i18nInstance.t('phone.signInIncomplete'));
        return false;
      }
      return true;
    } catch (unexpected) {
      setError(friendlyMessage(unexpected, i18nInstance.t('phone.wrongCode')));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { sendCode, verifyCode, isBusy, error, clearError: () => setError(null) };
}
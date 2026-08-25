import { useCallback, useState } from 'react';
import { AuthError } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

function friendlyMessage(error: unknown, fallback: string): string {
  if (error instanceof AuthError) {
    if (error.status === 429) {
      return 'Too many attempts. Please wait a minute before requesting another code.';
    }
    return error.message || fallback;
  }
  return fallback;
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
        setError(friendlyMessage(verifyError, 'That code is not right. Please try again.'));
        return false;
      }
      if (!data.session) {
        setError('That code did not complete sign-in. Please request a new one.');
        return false;
      }
      return true;
    } catch (unexpected) {
      setError(friendlyMessage(unexpected, 'That code is not right. Please try again.'));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { sendCode, verifyCode, isBusy, error, clearError: () => setError(null) };
}

import { useCallback, useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { isClerkAPIResponseError } from '@clerk/clerk-expo';

/**
 * Phone sign-in and sign-up as one flow.
 *
 * A professional entering their number does not know or care whether they have
 * an account. This tries sign-in first and falls back to sign-up when Clerk
 * reports the identifier is unknown, so both paths look identical in the UI.
 *
 * Clerk performs the verification and owns the OTP entirely — no code or
 * credential is ever sent to the SAMONA API.
 */
export type PhoneAuthMode = 'sign-in' | 'sign-up';

/** Maps a Clerk error to something worth showing a user. */
function friendlyMessage(error: unknown, fallback: string): string {
  if (isClerkAPIResponseError(error)) {
    // Clerk's messages are user-facing and already localised.
    return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
  }
  return fallback;
}

export function usePhoneAuth() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState<PhoneAuthMode>('sign-in');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoaded = signInLoaded && signUpLoaded;

  /**
   * Sends an OTP to the given E.164 number.
   *
   * Returns true when a code is on its way, so the caller can navigate.
   */
  const sendCode = useCallback(
    async (phoneNumber: string): Promise<boolean> => {
      if (!isLoaded || !signIn || !signUp) return false;

      setIsBusy(true);
      setError(null);

      try {
        const attempt = await signIn.create({ identifier: phoneNumber });
        const factor = attempt.supportedFirstFactors?.find(
          (f): f is typeof f & { phoneNumberId: string } =>
            f.strategy === 'phone_code' && 'phoneNumberId' in f,
        );

        if (!factor) {
          setError('This number cannot receive a verification code.');
          return false;
        }

        await signIn.prepareFirstFactor({
          strategy: 'phone_code',
          phoneNumberId: factor.phoneNumberId,
        });
        setMode('sign-in');
        return true;
      } catch (signInError) {
        // Unknown identifier means "no account yet", which is a sign-up, not a
        // failure. Any other error is real and surfaces to the user.
        const isUnknownIdentifier =
          isClerkAPIResponseError(signInError) &&
          signInError.errors.some((e) => e.code === 'form_identifier_not_found');

        if (!isUnknownIdentifier) {
          setError(friendlyMessage(signInError, 'Could not send a code. Please try again.'));
          return false;
        }

        try {
          await signUp.create({ phoneNumber });
          await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
          setMode('sign-up');
          return true;
        } catch (signUpError) {
          setError(friendlyMessage(signUpError, 'Could not send a code. Please try again.'));
          return false;
        }
      } finally {
        setIsBusy(false);
      }
    },
    [isLoaded, signIn, signUp],
  );

  /** Verifies the OTP and activates the session. */
  const verifyCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!isLoaded || !signIn || !signUp) return false;

      setIsBusy(true);
      setError(null);

      try {
        if (mode === 'sign-in') {
          const result = await signIn.attemptFirstFactor({ strategy: 'phone_code', code });
          if (result.status !== 'complete') {
            setError('That code did not complete sign-in. Please request a new one.');
            return false;
          }
          await setSignInActive({ session: result.createdSessionId });
          return true;
        }

        const result = await signUp.attemptPhoneNumberVerification({ code });
        if (result.status !== 'complete') {
          setError('That code did not complete sign-up. Please request a new one.');
          return false;
        }
        await setSignUpActive({ session: result.createdSessionId });
        return true;
      } catch (verifyError) {
        setError(friendlyMessage(verifyError, 'That code is not right. Please try again.'));
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [isLoaded, mode, signIn, signUp, setSignInActive, setSignUpActive],
  );

  return { sendCode, verifyCode, mode, isBusy, isLoaded, error, clearError: () => setError(null) };
}

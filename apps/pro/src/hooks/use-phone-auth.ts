
import { useCallback, useRef, useState } from 'react';
import { APP_TYPES } from '@samona/config';
import { supabase } from '@/services/supabase';
import { registerOtpAttempt } from '@/services/otp-telemetry';
import { i18nInstance } from '@/i18n';

const INTERNAL_COPY_PATTERN =
  /token|otp|jwt|expired|supabase/i;

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
  return (
    statusOf(error) === 429 ||
    /rate limit|too many/i.test(messageOf(error))
  );
}

function isConnectionProblem(error: unknown): boolean {
  return (
    statusOf(error) === undefined &&
    /network|fetch|timeout|connection|offline/i.test(messageOf(error))
  );
}

function friendlyMessage(error: unknown, fallback: string): string {
  if (isRateLimited(error)) {
    return i18nInstance.t('phone.tooManyAttempts');
  }

  if (isConnectionProblem(error)) {
    return i18nInstance.t('phone.noConnection');
  }

  const message = messageOf(error);
  const status = statusOf(error);

  const serviceProblem =
    (status !== undefined &&
      (status === 401 ||
        status === 402 ||
        status === 403 ||
        status >= 500)) ||
    INFRASTRUCTURE_COPY_PATTERN.test(message);

  return message &&
    !serviceProblem &&
    !INTERNAL_COPY_PATTERN.test(message)
    ? message
    : fallback;
}

function logAuthFailure(
  action: 'send' | 'verify',
  error: unknown,
) {
  if (!__DEV__) return;

  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;

  console.warn(`[phone-auth] ${action} failed`, {
    status: statusOf(error),
    code: typeof code === 'string' ? code : undefined,
  });
}

function verifyMessage(error: unknown): string {
  if (isRateLimited(error)) {
    return i18nInstance.t('phone.tooManyAttempts');
  }

  if (isConnectionProblem(error)) {
    return i18nInstance.t('phone.noConnection');
  }

  return i18nInstance.t('phone.wrongCode');
}

export function usePhoneAuth() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous lock prevents overlapping requests.
  const requestInFlight = useRef(false);

  const sendCode = useCallback(
    async (phone: string): Promise<boolean> => {
      if (requestInFlight.current) return false;

      requestInFlight.current = true;
      setIsBusy(true);
      setError(null);

      try {
        // Telemetry must never block OTP delivery.
        void registerOtpAttempt(phone, APP_TYPES.PRO).catch(
          (error) => {
            if (__DEV__) {
              console.warn('[phone-auth] telemetry failed', error);
            }
          },
        );

        const { error: otpError } =
          await supabase.auth.signInWithOtp({
            phone,
            options: {
              shouldCreateUser: true,
            },
          });

        if (otpError) {
          logAuthFailure('send', otpError);

          setError(
            friendlyMessage(
              otpError,
              i18nInstance.t('phone.couldNotSend'),
            ),
          );

          return false;
        }

        return true;
      } catch (unexpected) {
        logAuthFailure('send', unexpected);

        setError(
          friendlyMessage(
            unexpected,
            i18nInstance.t('phone.couldNotSend'),
          ),
        );

        return false;
      } finally {
        requestInFlight.current = false;
        setIsBusy(false);
      }
    },
    [],
  );

  const verifyCode = useCallback(
    async (phone: string, token: string): Promise<boolean> => {
      if (requestInFlight.current) return false;

      requestInFlight.current = true;
      setIsBusy(true);
      setError(null);

      try {
        const { data, error: verifyError } =
          await supabase.auth.verifyOtp({
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
          setError(
            i18nInstance.t('phone.signInIncomplete'),
          );
          return false;
        }

        return true;
      } catch (unexpected) {
        logAuthFailure('verify', unexpected);
        setError(verifyMessage(unexpected));
        return false;
      } finally {
        requestInFlight.current = false;
        setIsBusy(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sendCode,
    verifyCode,
    isBusy,
    error,
    clearError,
  };
}

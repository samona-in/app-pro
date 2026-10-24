'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OTP_LENGTH } from '@samona/config';
import { api, errorMessage } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { toast } from 'sonner';

/** Formats any user input into the E.164 shape Supabase expects. */
function toE164(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Countdown for "resend code" so a user cannot hammer Supabase.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /**
   * Pre-flight with the API first, then ask Supabase to send the SMS.
   *
   * The pre-flight enforces the 3-strike lockout and refuses non-admin phone
   * numbers before an SMS is billed. Supabase still performs the actual OTP
   * delivery and verification — the same flow the customer and pro apps use.
   */
  const sendOtp = async (): Promise<boolean> => {
    const e164 = toE164(phone);
    const digits = digitsOnly(phone);

    if (digits.length < 8) {
      toast.error('Enter a valid phone number, including country code.');
      return false;
    }

    try {
      await api.post('/admin/auth/request-otp', { phone: digits });
    } catch (error) {
      toast.error(errorMessage(error, 'This number is not authorised for admin access.'));
      return false;
    }

    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        phone: e164,
        options: { shouldCreateUser: false },
      });

      if (error) {
        toast.error(
          error.status === 429
            ? 'Too many codes requested. Please wait a minute and try again.'
            : error.message || 'Could not send the code. Please try again.',
        );
        return false;
      }

      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the code.');
      return false;
    }
  };

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (await sendOtp()) {
        setStep('otp');
        setOtp('');
        setResendIn(30);
        toast.success(`A ${OTP_LENGTH}-digit verification code has been sent to your phone.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    try {
      if (await sendOtp()) {
        setResendIn(30);
        toast.success(`A new ${OTP_LENGTH}-digit code has been sent.`);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verifies the code with Supabase, then exchanges the resulting access token
   * for an HttpOnly admin session. A successful OTP alone is not enough: the
   * API checks the database for an active admin record.
   */
  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    const e164 = toE164(phone);
    const digits = digitsOnly(phone);

    try {
      const { data, error } = await getSupabase().auth.verifyOtp({
        phone: e164,
        token: otp.trim(),
        type: 'sms',
      });

      if (error || !data.session?.access_token) {
        // Report the failure so the backend's 3-strike lockout covers wrong
        // codes too (Supabase owns verification, so it cannot see them).
        let lockedMessage: string | null = null;
        try {
          await api.post('/admin/auth/otp-failed', { phone: digits });
        } catch (reportError) {
          if ((reportError as { response?: { status?: number } })?.response?.status === 429) {
            lockedMessage = errorMessage(reportError, '');
          }
        }

        toast.error(
          lockedMessage ||
            (error?.message?.toLowerCase().includes('expired')
              ? 'That code has expired. Request a new one.'
              : 'That code is not correct. Please try again.'),
        );
        return;
      }

      const accessToken = data.session.access_token;

      try {
        const response = await api.post('/admin/auth/verify-otp', {
          phone: digits,
          accessToken,
        });

        // The Supabase session is no longer needed — the admin session is the
        // HttpOnly cookie. Discard the in-memory session explicitly.
        await getSupabase().auth.signOut().catch(() => undefined);

        const role = response.data?.adminUser?.role as string | undefined;
        toast.success(role ? `Signed in as ${role.replace(/_/g, ' ').toLowerCase()}` : 'Signed in');
        router.replace('/dashboard');
        router.refresh();
      } catch (exchangeError) {
        await getSupabase().auth.signOut().catch(() => undefined);
        toast.error(errorMessage(exchangeError, 'This account is not authorised for admin access.'));
      }
    } catch (unexpected) {
      toast.error(errorMessage(unexpected, 'That code is not correct. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">SAMONA Admin</h1>
          <p className="text-sm text-muted-foreground">
            {step === 'phone'
              ? 'Enter your registered admin phone number'
              : `Enter the ${OTP_LENGTH}-digit code sent to ${toE164(phone)}`}
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                autoFocus
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">Include your country code.</p>
            </div>
            <Button type="submit" className="w-full bg-[#054DFF] hover:bg-[#054DFF]/90" disabled={loading}>
              {loading ? 'Sending...' : 'Send Code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">Verification Code</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={`Enter the ${OTP_LENGTH}-digit code`}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                maxLength={OTP_LENGTH}
                autoFocus
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full bg-[#054DFF] hover:bg-[#054DFF]/90" disabled={loading || otp.length < OTP_LENGTH}>
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </Button>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                }}
                disabled={loading}
              >
                Change number
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleResend} disabled={loading || resendIn > 0}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

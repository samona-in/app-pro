import { act, renderHook } from '@testing-library/react-native';
import { AuthError } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { usePhoneAuth } from '../use-phone-auth';

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
    },
  },
}));

const signInWithOtp = supabase.auth.signInWithOtp as jest.MockedFunction<
  typeof supabase.auth.signInWithOtp
>;
const verifyOtp = supabase.auth.verifyOtp as jest.MockedFunction<typeof supabase.auth.verifyOtp>;

/** Supabase's own wording for a wrong or expired OTP. */
const RAW_TOKEN_ERROR = 'Token has expired or is invalid';

async function verifyWith(error: unknown) {
  if (error instanceof Error) {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error } as never);
  } else {
    verifyOtp.mockRejectedValue(error);
  }

  const { result } = renderHook(() => usePhoneAuth());
  await act(async () => {
    await result.current.verifyCode('+919876543210', '123456');
  });
  return result.current.error;
}

async function sendWith(error: unknown) {
  if (error instanceof Error) {
    signInWithOtp.mockResolvedValue({ data: {}, error } as never);
  } else {
    signInWithOtp.mockRejectedValue(error);
  }

  const { result } = renderHook(() => usePhoneAuth());
  await act(async () => {
    await result.current.sendCode('+919876543210');
  });
  return result.current.error;
}

describe('usePhoneAuth verification messages', () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    signInWithOtp.mockReset();
  });

  it('replaces the raw token error with a plain wrong-code message', async () => {
    expect(await verifyWith(new AuthError(RAW_TOKEN_ERROR, 403, 'otp_expired'))).toBe(
      'Incorrect code. Please try again.',
    );
  });

  it('maps the raw token error even when it is not an AuthError instance', async () => {
    // Two copies of Supabase's client in a monorepo can break `instanceof`.
    expect(await verifyWith({ message: RAW_TOKEN_ERROR, status: 403 })).toBe(
      'Incorrect code. Please try again.',
    );
  });

  it('treats any unexpected failure the same way', async () => {
    expect(await verifyWith(new Error('Network request failed'))).toBe(
      'Incorrect code. Please try again.',
    );
  });

  it('keeps the rate-limit advice instead of blaming the code', async () => {
    expect(
      await verifyWith(new AuthError('Too many requests', 429, 'over_request_rate_limit')),
    ).toBe('Too many attempts. Please wait a minute before requesting another code.');
  });
});

describe('usePhoneAuth send messages', () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
  });

  it('never echoes internal token wording when sending a code', async () => {
    expect(await sendWith(new AuthError(RAW_TOKEN_ERROR, 500, 'unexpected_failure'))).toBe(
      'Could not send a code. Please try again.',
    );
  });

  it('keeps a useful message that is safe to show', async () => {
    expect(await sendWith(new AuthError('Invalid phone number', 400, 'phone_invalid'))).toBe(
      'Invalid phone number',
    );
  });
});

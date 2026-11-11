import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import VerifyScreen from '../(auth)/verify';

/** The phone number the verify screen was opened for. */
const PHONE = '+919876543210';

const mockVerifyCode = jest.fn();
const mockSendCode = jest.fn();
const mockClearError = jest.fn();
const mockRestartResendWindow = jest.fn();
const mockStartOtpListening = jest.fn();
const mockStopOtpListening = jest.fn();
/** The useOtpAutoFill options the screen passed on its latest render. */
const mockOtpOptions: { onOtpReceived?: (code: string | null) => void } = {};
/** Mutated by tests to steer the phone-auth hook's state. */
const mockAuthState: { isBusy: boolean; error: string | null } = { isBusy: false, error: null };
/** Mutated by tests to steer the resend countdown. */
const mockCountdownState = { remainingSeconds: 0, isActive: false };

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ phone: PHONE }),
}));

jest.mock('@/components/auth', () => ({
  AuthHero: () => null,
}));

jest.mock('@/hooks', () => ({
  useCountdown: () => ({
    remainingSeconds: mockCountdownState.remainingSeconds,
    isActive: mockCountdownState.isActive,
    restart: mockRestartResendWindow,
  }),
  useOtpAutoFill: (options: { onOtpReceived?: (code: string | null) => void }) => {
    mockOtpOptions.onOtpReceived = options.onOtpReceived;
    return { otp: null };
  },
  usePhoneAuth: () => ({
    verifyCode: mockVerifyCode,
    sendCode: mockSendCode,
    isBusy: mockAuthState.isBusy,
    error: mockAuthState.error,
    clearError: mockClearError,
  }),
  getAppHash: jest.fn().mockResolvedValue(''),
  // Wrapped in lambdas: the factory runs before the mock constants below are
  // initialised, so referencing them directly would yield undefined.
  startOtpListening: (...args: unknown[]) => mockStartOtpListening(...args),
  stopOtpListening: (...args: unknown[]) => mockStopOtpListening(...args),
}));

/** The hidden TextInput that drives the four visible boxes. */
function otpField() {
  const [field] = screen.UNSAFE_getAllByType(TextInput);
  if (!field) throw new Error('The OTP field was not rendered');
  return field;
}

/** Simulates the Android retriever delivering a code to the screen. */
function autofill(code: string | null) {
  act(() => {
    mockOtpOptions.onOtpReceived?.(code);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.isBusy = false;
  mockAuthState.error = null;
  mockCountdownState.remainingSeconds = 0;
  mockCountdownState.isActive = false;
});

describe('VerifyScreen', () => {
  it('shows four empty boxes and a disabled Verify button until a code exists', () => {
    render(<VerifyScreen />);

    // The field is the hidden TextInput behind the four visible boxes.
    expect(otpField()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('fills the boxes from autofill and verifies automatically', async () => {
    mockVerifyCode.mockResolvedValue(true);
    render(<VerifyScreen />);

    autofill('4826');

    // All four digits are visible, one per box.
    for (const digit of '4826') {
      expect(screen.getByText(digit)).toBeTruthy();
    }
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '4826');
    });
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled();
    // A successful sign-in ends the SMS listening session.
    expect(mockStopOtpListening).toHaveBeenCalledTimes(1);
  });

  it('does not verify before the code is complete', async () => {
    mockVerifyCode.mockResolvedValue(true);
    render(<VerifyScreen />);

    fireEvent.changeText(otpField(), '482');

    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it('does not fill anything when autofill reports no code', () => {
    render(<VerifyScreen />);

    autofill(null);

    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it('verifies once when the code is typed manually', async () => {
    mockVerifyCode.mockResolvedValue(false);
    render(<VerifyScreen />);

    fireEvent.changeText(otpField(), '1111');

    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '1111');
    });
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
  });

  it('fires exactly one request per distinct code while editing', async () => {
    mockVerifyCode.mockResolvedValue(false);
    render(<VerifyScreen />);

    fireEvent.changeText(otpField(), '1111');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '1111');
    });

    // A different code gets its own single attempt…
    fireEvent.changeText(otpField(), '1112');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '1112');
    });
    expect(mockVerifyCode).toHaveBeenCalledTimes(2);

    // …but landing on the same digits again never re-fires it.
    fireEvent.changeText(otpField(), '1112');
    expect(mockVerifyCode).toHaveBeenCalledTimes(2);
  });

  it('does not re-verify when autofill re-delivers the same code', async () => {
    mockVerifyCode.mockResolvedValue(false);
    render(<VerifyScreen />);

    autofill('4826');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });

    autofill('4826');

    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
  });

  it('still allows a manual retry of the same failed code', async () => {
    mockVerifyCode.mockResolvedValue(false);
    render(<VerifyScreen />);

    autofill('4826');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledTimes(2);
    });
    expect(mockVerifyCode).toHaveBeenLastCalledWith(PHONE, '4826');
  });

  it('keeps the field read-only while a verification is in flight', () => {
    mockAuthState.isBusy = true;
    render(<VerifyScreen />);

    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
  });

  it('shows the error copy from the auth hook', () => {
    mockAuthState.error = 'Connection lost. Check your network and try again.';
    render(<VerifyScreen />);

    expect(screen.getByText('Connection lost. Check your network and try again.')).toBeTruthy();
  });

  it('resends: clears the code, re-arms the retriever and re-opens auto-verify', async () => {
    mockVerifyCode.mockResolvedValue(false);
    mockSendCode.mockResolvedValue(true);
    render(<VerifyScreen />);

    // A first attempt failed, so its code is locked against auto re-fires.
    autofill('4826');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });

    mockVerifyCode.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith(PHONE);
    });
    expect(mockStartOtpListening).toHaveBeenCalledTimes(1);
    expect(mockRestartResendWindow).toHaveBeenCalledTimes(1);
    // The old digits are gone and the button waits for a full code again.
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();

    // Even the same digits arriving again verify now: resend reset the lock.
    autofill('4826');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });
    expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '4826');
  });

  it('keeps resend locked while the countdown runs', () => {
    mockCountdownState.remainingSeconds = 12;
    mockCountdownState.isActive = true;
    render(<VerifyScreen />);

    const resend = screen.getByRole('button', { name: 'Resend code in 12s' });
    expect(resend).toBeDisabled();
    fireEvent.press(resend);
    expect(mockSendCode).not.toHaveBeenCalled();
  });
});

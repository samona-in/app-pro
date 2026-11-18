import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import VerifyScreen from '../(auth)/verify';

/** The phone number the verify screen was opened for. */
const PHONE = '+919876543210';

const mockVerifyCode = jest.fn();
const mockSendCode = jest.fn();
const mockClearError = jest.fn();
const mockRestartResendWindow = jest.fn();
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
  usePhoneAuth: () => ({
    verifyCode: mockVerifyCode,
    sendCode: mockSendCode,
    isBusy: mockAuthState.isBusy,
    error: mockAuthState.error,
    clearError: mockClearError,
  }),
}));

/** The hidden TextInput that drives the four visible boxes. */
function otpField() {
  const [field] = screen.UNSAFE_getAllByType(TextInput);
  if (!field) throw new Error('The OTP field was not rendered');
  return field;
}

/** Types a full code, the way a user fills the boxes. */
function enterCode(code: string) {
  fireEvent.changeText(otpField(), code);
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

  it('verifies once when a full code is typed', async () => {
    mockVerifyCode.mockResolvedValue(true);
    render(<VerifyScreen />);

    enterCode('4826');

    // All four digits are visible, one per box.
    for (const digit of '4826') {
      expect(screen.getByText(digit)).toBeTruthy();
    }
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '4826');
    });
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled();
  });

  it('does not verify before the code is complete', async () => {
    mockVerifyCode.mockResolvedValue(true);
    render(<VerifyScreen />);

    fireEvent.changeText(otpField(), '482');

    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it('fires exactly one request per distinct code while editing', async () => {
    mockVerifyCode.mockResolvedValue(false);
    render(<VerifyScreen />);

    enterCode('1111');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '1111');
    });

    // A different code gets its own single attempt…
    enterCode('1112');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(PHONE, '1112');
    });
    expect(mockVerifyCode).toHaveBeenCalledTimes(2);

    // …but landing on the same digits again never re-fires it.
    enterCode('1112');
    expect(mockVerifyCode).toHaveBeenCalledTimes(2);
  });

  it('still allows a manual retry of the same failed code', async () => {
    mockVerifyCode.mockResolvedValue(false);
    render(<VerifyScreen />);

    enterCode('4826');
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

  it('resends: clears the code and re-opens auto-verify', async () => {
    mockVerifyCode.mockResolvedValue(false);
    mockSendCode.mockResolvedValue(true);
    render(<VerifyScreen />);

    // A first attempt failed, so its code is locked against auto re-fires.
    enterCode('4826');
    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    });

    mockVerifyCode.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith(PHONE);
    });
    expect(mockRestartResendWindow).toHaveBeenCalledTimes(1);
    // The old digits are gone and the button waits for a full code again.
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();

    // Even the same digits arriving again verify now: resend reset the lock.
    enterCode('4826');
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

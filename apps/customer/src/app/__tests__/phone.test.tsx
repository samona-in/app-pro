/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories need lazy module loading. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { router } from 'expo-router';
import PhoneScreen from '../(auth)/phone';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';

const mockSendCode = jest.fn();
const mockOpenExternalUrl = jest.fn();
/** Mutated by tests to steer the phone-auth hook's state. */
const mockAuthState: { isBusy: boolean; error: string | null } = { isBusy: false, error: null };

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock('@/utils/open-url', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

jest.mock('@/components/auth', () => {
  const { jsx } = require('react/jsx-runtime');
  const { Pressable, View } = require('react-native');

  return {
    AuthHero: () => null,
    CountryCodeButton: ({
      country,
      expanded,
      onPress,
    }: {
      country: { dial: string };
      expanded?: boolean;
      onPress: () => void;
    }) =>
      jsx(Pressable, {
        accessibilityLabel: 'country button',
        accessibilityState: { expanded },
        onPress,
        children: `+${country.dial}`,
      }),
    CountryPickerSheet: ({ visible }: { visible: boolean }) =>
      jsx(View, {
        testID: 'country-picker',
        accessibilityLabel: visible ? 'country-picker-open' : 'country-picker-closed',
      }),
  };
});

jest.mock('@/hooks', () => ({
  // Wrapped in lambdas: the factory runs before the mock constants below are
  // initialised, so referencing them directly would yield undefined.
  usePhoneAuth: () => ({
    verifyCode: jest.fn(),
    sendCode: (...args: unknown[]) => mockSendCode(...args),
    isBusy: mockAuthState.isBusy,
    error: mockAuthState.error,
    clearError: jest.fn(),
  }),
  usePhoneHint: () => {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.isBusy = false;
  mockAuthState.error = null;
});

/** The local-part number field (the default country is India, +91). */
function numberField() {
  const [field] = screen.UNSAFE_getAllByType(TextInput);
  if (!field) throw new Error('The number field was not rendered');
  return field;
}

/** The Continue CTA, looked up fresh so its busy state is current. */
function continueButton() {
  return screen.getByRole('button', { name: 'Continue' });
}

describe('PhoneScreen', () => {
  it('requests a code and navigates to verify', async () => {
    mockSendCode.mockResolvedValue(true);
    render(<PhoneScreen />);

    fireEvent.changeText(numberField(), '9876543210');
    fireEvent.press(continueButton());

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith('+919876543210');
    });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/verify',
      params: { phone: '+919876543210' },
    });
  });

  it('stays on the screen when the number is invalid', async () => {
    render(<PhoneScreen />);

    fireEvent.changeText(numberField(), '12');
    fireEvent.press(continueButton());

    expect(await screen.findByText('Enter a valid phone number for India.')).toBeTruthy();
    expect(mockSendCode).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('asks for a number before doing anything', () => {
    render(<PhoneScreen />);

    fireEvent.press(continueButton());

    expect(screen.getByText('Enter your phone number.')).toBeTruthy();
    expect(mockSendCode).not.toHaveBeenCalled();
  });

  it('sends only one code when Continue is tapped twice', async () => {
    let finishSend!: (sent: boolean) => void;
    mockSendCode.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    render(<PhoneScreen />);

    fireEvent.changeText(numberField(), '9876543210');
    fireEvent.press(continueButton());
    fireEvent.press(continueButton());

    // The local submitting flag disables the CTA before the hook's busy state
    // lands, so a second tap cannot overlap the first request.
    expect(continueButton().props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      finishSend(true);
    });

    await waitFor(() => expect(mockSendCode).toHaveBeenCalledTimes(1));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('stays on the screen when the code request fails', async () => {
    mockSendCode.mockResolvedValue(false);
    render(<PhoneScreen />);

    fireEvent.changeText(numberField(), '9876543210');
    fireEvent.press(continueButton());

    await waitFor(() => expect(mockSendCode).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the country picker from the country button', () => {
    render(<PhoneScreen />);

    expect(screen.getByTestId('country-picker').props.accessibilityLabel).toBe(
      'country-picker-closed',
    );

    fireEvent.press(screen.getByLabelText('country button'));

    expect(screen.getByTestId('country-picker').props.accessibilityLabel).toBe(
      'country-picker-open',
    );
    expect(screen.getByLabelText('country button').props.accessibilityState?.expanded).toBe(true);
  });

  it('opens the legal links', () => {
    render(<PhoneScreen />);

    fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(TERMS_URL, expect.any(String), expect.any(String));

    fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(PRIVACY_URL, expect.any(String), expect.any(String));
  });
});

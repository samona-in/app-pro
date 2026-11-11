import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { router } from 'expo-router';
import PhoneScreen from '../(auth)/phone';

const mockSendCode = jest.fn();
const mockStartOtpListening = jest.fn();
/** Mutated by tests to steer the phone-auth hook's state. */
const mockAuthState: { isBusy: boolean; error: string | null } = { isBusy: false, error: null };

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The ui barrel re-exports these two, which pull in reanimated/worklets native
// modules that are unavailable under Jest. Stub them so the barrel loads.
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// The ui barrel pulls in LanguagePicker, which imports the real i18n setup;
// mocked here so the react-i18next mock above never has to provide its
// initializer. Only the pieces the picker renders are needed.
jest.mock('@/i18n', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'en', nativeName: 'English' },
    { code: 'te', nativeName: 'తెలుగు' },
    { code: 'hi', nativeName: 'हिन्दी' },
  ],
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock('@/components/auth', () => ({
  AuthHero: () => null,
  CountryCodeButton: () => null,
  CountryPickerSheet: () => null,
}));

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
  startOtpListening: (...args: unknown[]) => mockStartOtpListening(...args),
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

describe('PhoneScreen', () => {
  it('arms the SMS retriever before requesting a code', async () => {
    mockSendCode.mockResolvedValue(true);
    render(<PhoneScreen />);

    fireEvent.changeText(numberField(), '9876543210');
    fireEvent.press(screen.getByRole('button', { name: 'common.continue' }));

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith('+919876543210');
    });
    // The listener must already be armed when the request leaves.
    const [armOrder] = mockStartOtpListening.mock.invocationCallOrder;
    const [sendOrder] = mockSendCode.mock.invocationCallOrder;
    if (armOrder === undefined || sendOrder === undefined) {
      throw new Error('the retriever was not armed and a code not requested');
    }
    expect(armOrder).toBeLessThan(sendOrder);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/verify',
      params: { phone: '+919876543210' },
    });
  });

  it('stays on the screen when the number is invalid', async () => {
    render(<PhoneScreen />);

    fireEvent.changeText(numberField(), '12');
    fireEvent.press(screen.getByRole('button', { name: 'common.continue' }));

    expect(await screen.findByText('phone.invalidForCountry')).toBeTruthy();
    expect(mockSendCode).not.toHaveBeenCalled();
    expect(mockStartOtpListening).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('asks for a number before doing anything', () => {
    render(<PhoneScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'common.continue' }));

    expect(screen.getByText('phone.enterNumber')).toBeTruthy();
    expect(mockSendCode).not.toHaveBeenCalled();
    expect(mockStartOtpListening).not.toHaveBeenCalled();
  });
});

import { render } from '@testing-library/react-native';
import AuthLayout from '../(auth)/_layout';

// The ui barrel re-exports these two, which pull in reanimated/worklets native
// modules that are unavailable under Jest. Stub them so the barrel loads.
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

// Records every redirect the guard issues so the tests can assert the target.
const mockRedirect = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  Stack: Object.assign(() => null, { Screen: () => null }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockAuth = { isLoaded: true, isSignedIn: false };
jest.mock('@/providers', () => ({ useAuth: () => mockAuth }));

let mockHasChosenLanguage = false;
jest.mock('@/i18n', () => ({ hasChosenLanguage: () => mockHasChosenLanguage }));

describe('AuthLayout', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.isLoaded = true;
    mockAuth.isSignedIn = false;
    mockHasChosenLanguage = false;
  });

  it('sends a signed-out user to the language step before the phone flow', () => {
    render(<AuthLayout />);

    expect(mockRedirect).toHaveBeenCalledWith('/choose-language');
  });

  it('lets a signed-out user through once a language has been chosen', () => {
    mockHasChosenLanguage = true;
    render(<AuthLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('still routes a signed-in user through the entry route', () => {
    mockAuth.isSignedIn = true;
    render(<AuthLayout />);

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});

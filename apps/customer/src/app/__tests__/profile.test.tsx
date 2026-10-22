import { render, screen } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import Profile from '../(tabs)/profile';

/** The first ancestor whose className matches, so a styled wrapper can be found. */
function ancestorWithClass(element: ReactTestInstance, pattern: RegExp): string | null {
  let current: ReactTestInstance | null = element.parent;

  while (current) {
    const className = current.props?.className;
    if (typeof className === 'string' && pattern.test(className)) return className;
    current = current.parent;
  }

  return null;
}

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

// The photo picker needs a native module, and the screen never opens it here.
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

let mockUser: { phone: string | null; createdAt?: string } | undefined = {
  phone: '+91 98765 43210',
  createdAt: '2024-08-12T12:00:00.000Z',
};

jest.mock('@/hooks', () => ({
  useCustomerProfile: () => ({ data: { displayName: 'Aarav Sharma', avatarUrl: null } }),
  useSession: () => ({ user: mockUser, signOut: jest.fn() }),
  useUploadAvatar: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Profile', () => {
  beforeEach(() => {
    mockUser = { phone: '+91 98765 43210', createdAt: '2024-08-12T12:00:00.000Z' };
  });

  it('heads the screen with the quiet title and the account age', () => {
    render(<Profile />);

    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Member since August 2024')).toBeTruthy();
  });

  it('falls back to a plain line when the account has no date', () => {
    mockUser = { phone: '+91 98765 43210' };

    render(<Profile />);

    expect(screen.getByText('Your SAMONA account')).toBeTruthy();
    expect(screen.queryByText(/Member since/)).toBeNull();
  });

  it('shows the bio card with the name, the phone and the verified badge', () => {
    render(<Profile />);

    expect(screen.getByText('Aarav Sharma')).toBeTruthy();
    expect(screen.getByText('+91 98765 43210')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('fills the verified badge with green and puts the label on it in white', () => {
    render(<Profile />);

    const label = screen.getByText('Verified');
    const badge = ancestorWithClass(label, /rounded-full/);

    expect(badge).toMatch(/bg-success(?!-)/);
    expect(label.props.className).toMatch(/text-text-inverse/);
    // The white must not compete with another colour utility on the label.
    expect(label.props.className).not.toMatch(/text-text-muted/);
  });

  it('leaves the settings icons bare, with no tile behind them', () => {
    render(<Profile />);

    const row = screen.getByText('Manage addresses').parent;
    const icon = row?.children.find(
      (child): child is ReactTestInstance => typeof child !== 'string',
    );

    expect(icon?.props.className).not.toMatch(/bg-surface-muted/);
    expect(icon?.props.className).not.toMatch(/rounded/);
  });

  it('keeps the settings rows, the delete link and the sign out button', () => {
    render(<Profile />);

    expect(screen.getByText('Manage addresses')).toBeTruthy();
    expect(screen.getByText('Payment methods')).toBeTruthy();
    expect(screen.getByText('Notification settings')).toBeTruthy();
    expect(screen.getByText('Help & support')).toBeTruthy();
    expect(screen.getByText('Delete account')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('still lets the customer change the profile photo', () => {
    render(<Profile />);

    expect(screen.getByLabelText('Change profile photo')).toBeTruthy();
  });
});

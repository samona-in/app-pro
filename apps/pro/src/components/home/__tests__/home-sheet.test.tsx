import { fireEvent, render } from '@testing-library/react-native';
import { HomeSheet } from '../HomeSheet';

const mockOpenExternalUrl = jest.fn();

const mockSession: { isOnboardingComplete: boolean; nextStep?: string } = {
  isOnboardingComplete: false,
};
const mockProfile: { proServices: { id: string }[] } = { proServices: [] };
const mockCompletion: {
  isPending: boolean;
  isError: boolean;
  isVerified: boolean;
  nextStep: { key: string; route: string | null } | null;
  refetch: jest.Mock;
} = {
  isPending: false,
  isError: false,
  isVerified: false,
  nextStep: null,
  refetch: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/hooks', () => ({
  useSession: () => mockSession,
  useProProfile: () => ({ data: mockProfile }),
  useProfileCompletion: () => mockCompletion,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/utils/open-url', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Image: ({ accessibilityLabel, testID }: { accessibilityLabel?: string; testID?: string }) => (
      <View testID={testID ?? 'brand-banner'} accessibilityLabel={accessibilityLabel} />
    ),
  };
});
jest.mock('../CompleteProfileCard', () => {
  const { View } = jest.requireActual('react-native');
  return { CompleteProfileCard: () => <View testID="complete-profile-card" /> };
});
jest.mock('@/components/services/ServicesVerificationCard', () => {
  const { View } = jest.requireActual('react-native');
  return { ServicesVerificationCard: () => <View testID="services-card" /> };
});
jest.mock('react-native-gesture-handler', () => {
  const pan = {
    enabled: () => pan,
    activeOffsetY: () => pan,
    failOffsetX: () => pan,
    onStart: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withSpring: (value: number) => value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

describe('HomeSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.isOnboardingComplete = false;
    mockSession.nextStep = 'name';
    mockProfile.proServices = [];
    mockCompletion.isPending = false;
    mockCompletion.isError = false;
    mockCompletion.isVerified = false;
    mockCompletion.nextStep = { key: 'profile', route: '/onboarding/name' };
  });

  it('shows the completion prompt instead of services while onboarding is incomplete', () => {
    const view = render(<HomeSheet />);

    expect(view.getByTestId('complete-profile-card')).toBeTruthy();
    expect(view.queryByTestId('services-card')).toBeNull();
    expect(view.queryByText('Your services')).toBeNull();
  });

  it('shows the completion prompt while verification is pending', () => {
    mockSession.isOnboardingComplete = true;
    mockProfile.proServices = [{ id: 'svc-1' }];
    mockCompletion.nextStep = { key: 'verification', route: '/profile' };

    const view = render(<HomeSheet />);

    expect(view.getByTestId('complete-profile-card')).toBeTruthy();
    expect(view.queryByTestId('services-card')).toBeNull();
    expect(view.queryByText('Your services')).toBeNull();
  });

  it('shows the completion prompt while documents are awaiting review', () => {
    mockSession.isOnboardingComplete = true;
    mockProfile.proServices = [{ id: 'svc-1' }];
    mockCompletion.nextStep = { key: 'documents', route: '/documents' };

    const view = render(<HomeSheet />);

    expect(view.getByTestId('complete-profile-card')).toBeTruthy();
    expect(view.queryByTestId('services-card')).toBeNull();
  });

  it('shows the existing services card once the profile is verified', () => {
    mockSession.isOnboardingComplete = true;
    mockProfile.proServices = [{ id: 'svc-1' }];
    mockCompletion.isVerified = true;

    const view = render(<HomeSheet />);

    expect(view.getByTestId('services-card')).toBeTruthy();
    expect(view.queryByTestId('complete-profile-card')).toBeNull();
  });

  it('keeps the existing empty-services block when verified without services', () => {
    mockSession.isOnboardingComplete = true;
    mockCompletion.isVerified = true;

    const view = render(<HomeSheet />);

    expect(view.getByText('Your services')).toBeTruthy();
    expect(view.queryByTestId('complete-profile-card')).toBeNull();
  });

  it('closes the sheet with the brand banner instead of the made-in text', () => {
    mockSession.isOnboardingComplete = true;
    mockProfile.proServices = [{ id: 'svc-1' }];
    mockCompletion.isVerified = true;

    const view = render(<HomeSheet />);

    expect(view.getByTestId('brand-banner')).toBeTruthy();
    expect(view.queryByText('SAMONA made in Hyderabad')).toBeNull();
  });

  it('opens SAMONA Instagram from the link below the brand banner', () => {
    const view = render(<HomeSheet />);

    const link = view.getByLabelText('Open SAMONA on Instagram');
    expect(link).toBeTruthy();
    expect(view.getByTestId('instagram-icon')).toBeTruthy();

    fireEvent.press(link);
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      'https://www.instagram.com/samona.in',
      'Could not open page',
      'Check your connection and try again.',
    );
  });

  it('does not flash the completion prompt while completion data is loading', () => {
    mockSession.isOnboardingComplete = true;
    mockProfile.proServices = [{ id: 'svc-1' }];
    mockCompletion.isPending = true;
    mockCompletion.nextStep = { key: 'verification', route: '/profile' };

    const view = render(<HomeSheet />);

    expect(view.getByTestId('services-card')).toBeTruthy();
    expect(view.queryByTestId('complete-profile-card')).toBeNull();
  });

  it('keeps services when the completion request fails', () => {
    mockSession.isOnboardingComplete = true;
    mockProfile.proServices = [{ id: 'svc-1' }];
    mockCompletion.isError = true;
    mockCompletion.nextStep = { key: 'verification', route: '/profile' };

    const view = render(<HomeSheet />);

    expect(view.getByTestId('services-card')).toBeTruthy();
    expect(view.queryByTestId('complete-profile-card')).toBeNull();
  });
});

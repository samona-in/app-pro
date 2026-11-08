import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CompleteProfileCard } from '../CompleteProfileCard';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

describe('CompleteProfileCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resumes at the next step supplied by the completion state', () => {
    const view = render(<CompleteProfileCard nextRoute="/onboarding/services" />);

    expect(view.getByText('Complete Your Profile')).toBeTruthy();
    expect(
      view.getByText('Complete your profile to start receiving service requests.'),
    ).toBeTruthy();

    fireEvent.press(view.getByText('Complete Profile'));

    expect(router.push).toHaveBeenCalledWith('/onboarding/services');
  });

  it('opens the verification status while review is pending', () => {
    const view = render(<CompleteProfileCard nextRoute="/profile" />);

    fireEvent.press(view.getByText('Complete Profile'));

    expect(router.push).toHaveBeenCalledWith('/profile');
  });

  it('falls back to the intro when no next step is known', () => {
    const view = render(<CompleteProfileCard nextRoute={null} />);

    fireEvent.press(view.getByText('Complete Profile'));

    expect(router.push).toHaveBeenCalledWith('/onboarding/intro');
  });
});

import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AadhaarEntryCard } from '../AadhaarEntryCard';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

describe('AadhaarEntryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('describes the camera shortcut without claiming instant verification', () => {
    const { getByText, getByLabelText } = render(<AadhaarEntryCard source="profile" />);

    expect(getByText('Aadhaar card')).toBeTruthy();
    expect(getByText('Capture both sides with your camera')).toBeTruthy();
    expect(getByText('Camera')).toBeTruthy();
    expect(getByLabelText('Add your Aadhaar card using the camera')).toBeTruthy();
  });

  it('opens the flow with only the non-sensitive source in the params', () => {
    const { getByRole } = render(<AadhaarEntryCard source="onboarding" />);

    fireEvent.press(getByRole('button', { name: 'Add your Aadhaar card using the camera' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/aadhaar',
      params: { source: 'onboarding' },
    });
  });

  it('passes the profile source when opened from documents', () => {
    const { getByRole } = render(<AadhaarEntryCard source="profile" />);

    fireEvent.press(getByRole('button', { name: 'Add your Aadhaar card using the camera' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/aadhaar',
      params: { source: 'profile' },
    });
  });
});

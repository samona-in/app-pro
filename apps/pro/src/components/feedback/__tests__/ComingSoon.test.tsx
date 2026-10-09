import { render } from '@testing-library/react-native';
import '@/i18n';
import { ComingSoon } from '../ComingSoon';

// The ui barrel re-exports these two, which pull in reanimated/worklets native
// modules that are unavailable under Jest. Stub them so the barrel loads.
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('ComingSoon', () => {
  it('renders the shared heading', () => {
    const { getByText } = render(<ComingSoon icon="wallet-outline" description="Something soon" />);

    expect(getByText('Coming Soon')).toBeTruthy();
  });

  it('renders the feature description', () => {
    const { getByText } = render(
      <ComingSoon icon="wallet-outline" description="Managing your work availability." />,
    );

    expect(getByText('Managing your work availability.')).toBeTruthy();
  });
});

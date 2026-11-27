import { fireEvent, render } from '@testing-library/react-native';
import { InstagramLink } from '../InstagramLink';

const mockOpenExternalUrl = jest.fn();

jest.mock('@/utils/open-url', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Image: ({ testID }: { testID?: string }) => <View testID={testID} />,
  };
});

describe('InstagramLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens SAMONA Instagram with the supplied icon', () => {
    const view = render(<InstagramLink />);

    expect(view.getByTestId('instagram-icon')).toBeTruthy();

    const link = view.getByLabelText('Open SAMONA on Instagram');
    fireEvent.press(link);

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      'https://www.instagram.com/samona.in',
      'Could not open page',
      'Check your connection and try again.',
    );
  });
});

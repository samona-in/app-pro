import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ChooseLanguage from '../choose-language';

// The ui barrel re-exports these two, which pull in reanimated/worklets native
// modules that are unavailable under Jest. Stub them so the barrel loads.
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

describe('ChooseLanguage', () => {
  it('commits the selected language and continues to welcome', async () => {
    const { getByLabelText, getByRole } = render(<ChooseLanguage />);

    // Queried by label: the hero illustration also renders the script names.
    fireEvent.press(getByLabelText('हिन्दी'));
    // Queried by role: selecting a language previews it live, so the button
    // label is no longer guaranteed to be English.
    fireEvent.press(getByRole('button'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
  });
});

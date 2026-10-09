import { fireEvent, render } from '@testing-library/react-native';
import { LanguagePicker } from '../LanguagePicker';

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('LanguagePicker', () => {
  it('renders every supported language', () => {
    const { getByText } = render(<LanguagePicker selected="en" onSelect={() => {}} />);

    expect(getByText('English')).toBeTruthy();
    expect(getByText('తెలుగు')).toBeTruthy();
    expect(getByText('हिन्दी')).toBeTruthy();
  });

  it('reports the tapped language without handling selection itself', () => {
    const onSelect = jest.fn();
    const { getByText } = render(<LanguagePicker selected="en" onSelect={onSelect} />);

    fireEvent.press(getByText('हिन्दी'));

    expect(onSelect).toHaveBeenCalledWith('hi');
  });
});

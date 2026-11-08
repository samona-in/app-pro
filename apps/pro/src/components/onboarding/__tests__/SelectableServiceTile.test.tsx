import { fireEvent, render, screen } from '@testing-library/react-native';
import { SelectableServiceTile } from '../SelectableServiceTile';

// The icon set lazily loads a font, and `expo-image` needs a native module.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/services/ServiceImage', () => ({
  isImageUrl: (value: string) => value.startsWith('http'),
  ServiceImage: () => null,
}));

describe('SelectableServiceTile', () => {
  it('shows the service name and reports taps', () => {
    const onToggle = jest.fn();
    render(
      <SelectableServiceTile
        label="AC Repair"
        icon="https://cdn.example.com/ac.png"
        selected={false}
        onToggle={onToggle}
      />,
    );

    const tile = screen.getByLabelText('AC Repair');
    expect(screen.getByText('AC Repair')).toBeOnTheScreen();
    expect(tile.props.accessibilityRole).toBe('checkbox');
    expect(tile.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(tile);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks the selected service as checked', () => {
    render(<SelectableServiceTile label="AC Repair" icon={null} selected onToggle={jest.fn()} />);

    expect(screen.getByLabelText('AC Repair').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });
});

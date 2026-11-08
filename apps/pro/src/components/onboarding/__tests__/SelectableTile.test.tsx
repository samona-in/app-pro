import { fireEvent, render, screen } from '@testing-library/react-native';
import femaleImage from '@/assets/images/gender/female.png';
import { SelectableTile } from '../SelectableTile';

describe('SelectableTile', () => {
  it('shows the label under the artwork', () => {
    render(
      <SelectableTile label="Female" image={femaleImage} selected={false} onToggle={jest.fn()} />,
    );

    expect(screen.getByText('Female')).toBeOnTheScreen();
  });

  it('announces the choice as a radio and reports taps', () => {
    const onToggle = jest.fn();
    render(
      <SelectableTile label="Female" image={femaleImage} selected={false} onToggle={onToggle} />,
    );

    const tile = screen.getByLabelText('Female');
    expect(tile.props.accessibilityRole).toBe('radio');
    expect(tile.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(tile);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks the selected tile as checked', () => {
    render(<SelectableTile label="Female" image={femaleImage} selected onToggle={jest.fn()} />);

    expect(screen.getByLabelText('Female').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });
});

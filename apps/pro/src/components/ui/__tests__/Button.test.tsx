import { fireEvent, render } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('renders its label', () => {
    const { getByText } = render(<Button label="Accept job" onPress={jest.fn()} />);

    expect(getByText('Accept job')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Accept job" onPress={onPress} />);

    fireEvent.press(getByRole('button', { name: 'Accept job' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress while loading', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Accept job" loading onPress={onPress} />);

    fireEvent.press(getByRole('button', { name: 'Accept job' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * Guards against the label inheriting the variant's text colour from the
   * type scale — dark-on-dark made primary labels invisible (see Button.tsx).
   */
  it('renders the primary label in the brand contrast colour', () => {
    const { getByText } = render(<Button label="Get started" onPress={jest.fn()} />);

    expect(getByText('Get started')).toHaveStyle({ color: '#FFFFFF' });
  });
});

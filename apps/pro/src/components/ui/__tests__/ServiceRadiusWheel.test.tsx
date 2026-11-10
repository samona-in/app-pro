import { fireEvent, render, screen } from '@testing-library/react-native';
import '@/i18n';
import { ServiceRadiusWheel } from '../ServiceRadiusWheel';

const mockWheelPicker = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('@quidone/react-native-wheel-picker', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockWheelPicker(props),
}));

/** Renders the wheel and returns the props handed to the picker library. */
function renderWheel(props: Partial<React.ComponentProps<typeof ServiceRadiusWheel>> = {}) {
  render(<ServiceRadiusWheel value={14} onChange={jest.fn()} {...props} />);
  return mockWheelPicker.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe('ServiceRadiusWheel', () => {
  beforeEach(() => {
    mockWheelPicker.mockClear();
  });

  it('feeds one labelled row per kilometre and the saved radius to the library', () => {
    const props = renderWheel({ min: 1, max: 50, value: 14 });

    const data = props.data as { value: number; label: string }[];
    expect(data).toHaveLength(50);
    expect(data[0]).toEqual({ value: 1, label: '1 km' });
    expect(data.at(-1)).toEqual({ value: 50, label: '50 km' });
    expect(props).toMatchObject({
      value: 14,
      itemHeight: 44,
      visibleItemCount: 5,
      readOnly: false,
      width: '100%',
    });
  });

  it('reports the value the wheel settles on', () => {
    const onChange = jest.fn();
    const props = renderWheel({ onChange });

    (props.onValueChanged as (event: { item: { value: number } }) => void)({
      item: { value: 22 },
    });

    expect(onChange).toHaveBeenCalledWith(22);
  });

  it('locks the wheel while a save is in flight', () => {
    const props = renderWheel({ disabled: true });
    expect(props.readOnly).toBe(true);
  });

  it('steps the radius from an accessibility action', () => {
    const onChange = jest.fn();
    renderWheel({ value: 14, onChange });

    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    expect(onChange).toHaveBeenNthCalledWith(1, 15);
    expect(onChange).toHaveBeenNthCalledWith(2, 13);
  });
});

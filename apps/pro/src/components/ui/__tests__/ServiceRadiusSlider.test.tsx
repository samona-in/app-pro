import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ServiceRadiusSlider } from '../ServiceRadiusSlider';

const mockRangeSlider = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('react-native-fast-range-slider', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockRangeSlider(props),
}));

/** Renders the slider, measures its track, and returns the library props. */
function renderSlider(props: Partial<React.ComponentProps<typeof ServiceRadiusSlider>> = {}) {
  render(<ServiceRadiusSlider value={14} onRelease={jest.fn()} {...props} />);
  fireEvent(screen.getByRole('adjustable'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 50 } },
  });
  return mockRangeSlider.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe('ServiceRadiusSlider', () => {
  beforeEach(() => {
    mockRangeSlider.mockClear();
  });

  it('feeds the whole-kilometre bounds and the saved radius to the library', () => {
    const props = renderSlider({ min: 1, max: 50, value: 14 });

    expect(props).toMatchObject({
      min: 1,
      max: 50,
      step: 1,
      initialMinValue: 1,
      initialMaxValue: 14,
      // The wrapper measures 320px; the library insets 15px on each side.
      width: 290,
      enabled: true,
    });
  });

  it('reports the right handle live and on release', () => {
    const onValueChange = jest.fn();
    const onRelease = jest.fn();
    const props = renderSlider({ onValueChange, onRelease });

    (props.onValuesChange as (values: [number, number]) => void)([1, 17]);
    expect(onValueChange).toHaveBeenCalledWith(17);

    (props.onValuesChangeFinish as (values: [number, number]) => void)([1, 22]);
    expect(onRelease).toHaveBeenCalledWith(22);
  });

  it('ignores the pinned left handle and re-seeds it', () => {
    const onRelease = jest.fn();
    const props = renderSlider({ onRelease });
    const rendersBefore = mockRangeSlider.mock.calls.length;
    expect(rendersBefore).toBe(1);

    act(() => {
      (props.onValuesChangeFinish as (values: [number, number]) => void)([9, 14]);
    });

    expect(onRelease).toHaveBeenCalledWith(14);
    // A remount is what snaps the pinned handle back onto `min`.
    expect(mockRangeSlider.mock.calls.length).toBeGreaterThan(rendersBefore);
  });

  it('disables the library while a save is in flight', () => {
    const props = renderSlider({ loading: true });
    expect(props.enabled).toBe(false);
  });

  it('steps the radius from an accessibility action', () => {
    const onRelease = jest.fn();
    renderSlider({ value: 14, onRelease });

    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    expect(onRelease).toHaveBeenCalledWith(15);
  });
});

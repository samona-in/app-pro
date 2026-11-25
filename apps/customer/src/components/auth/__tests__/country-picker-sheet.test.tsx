/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories need lazy module loading. */
import { render, screen } from '@testing-library/react-native';
import { CountryPickerSheet } from '../CountryPickerSheet';
import { DEFAULT_COUNTRY } from '@/constants/countries';

const sheetMethods = (
  jest.requireMock('@gorhom/bottom-sheet') as {
    __sheetMethods: { snapToIndex: jest.Mock; close: jest.Mock };
  }
).__sheetMethods;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/constants/countries', () => ({
  COUNTRIES: [{ iso: 'in', name: 'India', dial: '91', flag: 1 }],
  DEFAULT_COUNTRY: { iso: 'in', name: 'India', dial: '91', flag: 1 },
}));

/**
 * The sheet is native-heavy under Jest. Rendering its `backdropComponent`
 * exactly as the library does makes the touch blocker this test guards against
 * observable without loading the native implementation.
 */
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { jsx } = require('react/jsx-runtime');
  const { View } = require('react-native');

  const methods = { snapToIndex: jest.fn(), close: jest.fn() };
  const Backdrop = () =>
    jsx(View, {
      testID: 'country-picker-backdrop',
      accessibilityLabel: 'Bottom sheet backdrop',
    });

  const BottomSheet = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => methods);
    const BackdropComponent = props.backdropComponent;
    return jsx(View, {
      testID: 'bottom-sheet',
      children: [
        BackdropComponent
          ? jsx(
              View,
              {
                children: jsx(BackdropComponent, {
                  animatedIndex: { value: -1 },
                  animatedPosition: { value: 0 },
                }),
              },
              'backdrop',
            )
          : null,
        jsx(View, { children: props.children }, 'content'),
      ],
    });
  });

  return {
    __esModule: true,
    default: BottomSheet,
    __sheetMethods: methods,
    BottomSheetBackdrop: Backdrop,
    BottomSheetScrollView: (props: any) => jsx(View, { children: props.children }),
    useBottomSheetSpringConfigs: () => ({}),
  };
});

function renderSheet(visible: boolean) {
  return render(
    <CountryPickerSheet
      visible={visible}
      selectedIso={DEFAULT_COUNTRY.iso}
      onClose={jest.fn()}
      onSelect={jest.fn()}
    />,
  );
}

describe('CountryPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not leave a backdrop mounted while closed', () => {
    renderSheet(false);

    expect(sheetMethods.close).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('country-picker-backdrop')).toBeNull();
  });

  it('mounts the backdrop only while the sheet is open', () => {
    const view = renderSheet(true);

    expect(sheetMethods.snapToIndex).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('country-picker-backdrop')).toBeTruthy();

    view.rerender(
      <CountryPickerSheet
        visible={false}
        selectedIso={DEFAULT_COUNTRY.iso}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('country-picker-backdrop')).toBeNull();
    expect(sheetMethods.close).toHaveBeenCalledTimes(1);
  });
});

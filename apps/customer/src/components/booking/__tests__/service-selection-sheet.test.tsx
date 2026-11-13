import { fireEvent, render, screen } from '@testing-library/react-native';
import { ServiceSelectionSheet } from '../ServiceSelectionSheet';
import type { DraftGroup } from '@/stores/booking';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * `@gorhom/bottom-sheet` is native-heavy, so it renders as a plain view. The
 * sheet is driven through its ref, so those methods are shared spies.
 */
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { jsx } = require('react/jsx-runtime');
  const { View } = require('react-native');

  const sheetMethods = { snapToIndex: jest.fn(), close: jest.fn() };

  const BottomSheet = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => sheetMethods);
    return jsx(View, { testID: 'bottom-sheet', children: props.children });
  });

  return {
    __esModule: true,
    default: BottomSheet,
    __sheetMethods: sheetMethods,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (props: any) => jsx(View, { children: props.children }),
    useBottomSheetSpringConfigs: () => ({}),
  };
});

const plumbing: DraftGroup = {
  service: { id: 'svc-plumbing', slug: 'plumbing', name: 'Plumbing', icon: null } as never,
  items: [
    {
      skill: {
        id: 'sk-leak',
        slug: 'leak-repair',
        name: 'Leak repair',
        pricingModel: 'PER_UNIT',
        basePricePaise: 24_900,
        unitLabel: 'tap',
        minQuantity: 1,
        maxQuantity: 5,
      } as never,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    },
  ],
};

const electrical: DraftGroup = {
  service: { id: 'svc-electrical', slug: 'electrical', name: 'Electrical', icon: null } as never,
  items: [
    {
      skill: {
        id: 'sk-switch',
        slug: 'switch-repair',
        name: 'Switch repair',
        pricingModel: 'PER_UNIT',
        basePricePaise: 15_000,
        unitLabel: 'switch',
        minQuantity: 1,
        maxQuantity: 5,
      } as never,
      customSkill: '',
      quantity: 2,
      durationMinutes: null,
      totalPaise: 30_000,
    },
  ],
};

const groups = [plumbing, electrical];

function renderSheet(overrides: Partial<Parameters<typeof ServiceSelectionSheet>[0]> = {}) {
  const onContinue = jest.fn();
  const onClose = jest.fn();

  render(
    <ServiceSelectionSheet
      visible
      groups={groups}
      onClose={onClose}
      onContinue={onContinue}
      {...overrides}
    />,
  );

  return { onContinue, onClose };
}

describe('service selection sheet', () => {
  it('starts with every cart service selected and books them all', () => {
    const { onContinue } = renderSheet();

    expect(screen.getByText('2 of 2 selected')).toBeTruthy();
    expect(screen.getByText('₹549')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Continue'));

    expect(onContinue).toHaveBeenCalledWith(['plumbing', 'electrical']);
  });

  it('leaves out a service the customer unticks', () => {
    const { onContinue } = renderSheet();

    fireEvent.press(screen.getByLabelText('Electrical, 1 work, ₹300'));

    expect(screen.getByText('1 of 2 selected')).toBeTruthy();
    // The footer only totals what is about to be booked; the plumbing row and
    // the footer now agree.
    expect(screen.getAllByText('₹249')).toHaveLength(2);
    expect(screen.getByText('1 of 2 services')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Continue'));

    expect(onContinue).toHaveBeenCalledWith(['plumbing']);
  });

  it('selects and clears every service from the "All services" row', () => {
    const { onContinue } = renderSheet();

    fireEvent.press(screen.getByLabelText('Clear all services'));
    expect(screen.getByText('0 of 2 selected')).toBeTruthy();

    const button = screen.getByLabelText('Continue');
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
    fireEvent.press(button);
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Select all services'));
    expect(screen.getByText('2 of 2 selected')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Continue'));
    expect(onContinue).toHaveBeenCalledWith(['plumbing', 'electrical']);
  });

  it('reports a close without booking anything', () => {
    const { onClose } = renderSheet();

    fireEvent.press(screen.getByLabelText('Close service selection'));

    expect(onClose).toHaveBeenCalled();
  });
});

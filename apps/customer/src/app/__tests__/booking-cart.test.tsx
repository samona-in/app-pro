import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { SkillOption } from '@samona/types';
import BookingCart from '../booking/new/[slug]/cart';
import { useBookingDraft } from '@/stores/booking';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'plumbing' }),
}));

/**
 * The selection sheet is a bottom sheet (native-heavy) with its own test file.
 * Here it is a probe that reports the services the cart hands over, so the
 * cart's routing behaviour can be asserted without the sheet's internals.
 */
jest.mock('@/components/booking/ServiceSelectionSheet', () => {
  const React = require('react');
  const { jsx } = require('react/jsx-runtime');
  const { Pressable, Text, View } = require('react-native');

  return {
    ServiceSelectionSheet: ({
      visible,
      groups,
      onContinue,
    }: {
      visible: boolean;
      groups: { service: { slug: string } }[];
      onContinue: (slugs: string[]) => void;
    }) =>
      visible
        ? jsx(View, {
            testID: 'service-selection-sheet',
            children: jsx(
              Pressable,
              {
                accessibilityRole: 'button',
                accessibilityLabel: 'Confirm selected services',
                onPress: () => onContinue(groups.map((group) => group.service.slug)),
              },
              jsx(Text, { children: 'Confirm selected services' }),
            ),
          })
        : null,
  };
});

const leakRepair: SkillOption = {
  id: 'sk-leak-repair',
  serviceId: 'service-plumbing',
  slug: 'leak-repair',
  name: 'Leak repair',
  icon: null,
  groupId: null,
  pricingModel: 'PER_UNIT',
  basePricePaise: 24_900,
  unitLabel: 'tap',
  minQuantity: 1,
  maxQuantity: 5,
};

const drainCleaning: SkillOption = {
  id: 'sk-drain-cleaning',
  serviceId: 'service-plumbing',
  slug: 'drain-cleaning',
  name: 'Drain cleaning',
  icon: null,
  groupId: null,
  pricingModel: 'PER_HOUR',
  basePricePaise: 30_000,
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
  durationStepMinutes: 30,
};

const reseal: SkillOption = {
  id: 'sk-other',
  serviceId: 'service-plumbing',
  slug: 'other',
  name: 'Other',
  icon: null,
  groupId: null,
  pricingModel: 'PER_BOOKING',
  basePricePaise: 29_900,
};

const switchRepair: SkillOption = {
  id: 'sk-switch-repair',
  serviceId: 'service-electrical',
  slug: 'switch-repair',
  name: 'Switch repair',
  icon: null,
  groupId: null,
  pricingModel: 'PER_UNIT',
  basePricePaise: 15_000,
  unitLabel: 'switch',
  minQuantity: 1,
  maxQuantity: 5,
};

describe('booking cart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBookingDraft.getState().reset();
  });

  it('shows the empty state and returns to the catalogue', () => {
    render(<BookingCart />);

    expect(screen.getByText('Nothing booked yet')).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();

    fireEvent.press(screen.getByText('Browse works'));

    expect(router.back).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('lists every cart work with its quantity control and estimate', () => {
    const draft = useBookingDraft.getState();
    draft.start({ slug: 'plumbing', name: 'Plumbing' } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 2,
      durationMinutes: null,
      totalPaise: 49_800,
    });
    draft.addItem({
      skill: reseal,
      customSkill: 'Bathroom reseal',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 29_900,
    });

    render(<BookingCart />);

    // The custom text reads as the "Other" work's name.
    expect(screen.getByText('Leak repair')).toBeTruthy();
    expect(screen.getByText('Bathroom reseal')).toBeTruthy();
    expect(screen.getByLabelText('Leak repair quantity 2')).toBeTruthy();
    expect(screen.getAllByText('₹498')).toHaveLength(1);
    expect(screen.getAllByText('₹299')).toHaveLength(1);

    // The visit summary: two works, three units, one total.
    expect(screen.getByText('2 works · 3 items')).toBeTruthy();
    expect(screen.getByText('₹797')).toBeTruthy();

    fireEvent.press(screen.getByText('Continue'));

    expect(router.push).toHaveBeenCalledWith('/booking/review');
  });

  it('groups a multi-service cart by service and totals the whole checkout', () => {
    const draft = useBookingDraft.getState();
    draft.start({
      id: 'service-plumbing',
      slug: 'plumbing',
      name: 'Plumbing',
      icon: null,
    } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });
    draft.start({
      id: 'service-electrical',
      slug: 'electrical',
      name: 'Electrical',
      icon: null,
    } as never);
    draft.addItem({
      skill: switchRepair,
      customSkill: '',
      quantity: 2,
      durationMinutes: null,
      totalPaise: 30_000,
    });

    render(<BookingCart />);

    // The header mirrors the notifications inbox: a large title, a quiet
    // summary line and a round close control.
    expect(screen.getByText('Your cart')).toBeTruthy();
    expect(screen.getByText('2 works · 2 services')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close cart'));
    expect(router.back).toHaveBeenCalled();

    // Each service keeps its own section and estimate.
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.getByText('Electrical')).toBeTruthy();
    expect(screen.getByText('1 work · ₹249')).toBeTruthy();
    expect(screen.getByText('1 work · ₹300')).toBeTruthy();

    // The footer summarizes the whole checkout, not just one trade.
    expect(screen.getByText('2 works · 3 items')).toBeTruthy();
    expect(screen.getByText('₹549')).toBeTruthy();

    // Several services need a choice first: Continue opens the selection sheet
    // instead of sending the whole cart straight to review.
    expect(screen.queryByTestId('service-selection-sheet')).toBeNull();
    fireEvent.press(screen.getByText('Continue'));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('service-selection-sheet')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Confirm selected services'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/booking/review',
      params: { services: 'plumbing,electrical' },
    });
  });

  it('does not offer a control that clears a whole service from the cart', () => {
    const draft = useBookingDraft.getState();
    draft.start({
      id: 'service-plumbing',
      slug: 'plumbing',
      name: 'Plumbing',
      icon: null,
    } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });
    draft.start({
      id: 'service-electrical',
      slug: 'electrical',
      name: 'Electrical',
      icon: null,
    } as never);
    draft.addItem({
      skill: switchRepair,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 15_000,
    });

    render(<BookingCart />);

    // Works leave the cart through their own minus control, not a group-level
    // or per-row trash affordance.
    expect(screen.queryByLabelText('Remove Electrical from cart')).toBeNull();
    expect(screen.queryByLabelText('Remove Plumbing from cart')).toBeNull();
    expect(screen.queryByLabelText('Remove Switch repair')).toBeNull();
    expect(screen.getByLabelText('Reduce quantity of Switch repair')).toBeTruthy();
    expect(screen.getByText('Electrical')).toBeTruthy();
  });

  it('adjusts a work through the quantity stepper and re-estimates the visit', () => {
    const draft = useBookingDraft.getState();
    draft.start({ slug: 'plumbing', name: 'Plumbing' } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });

    render(<BookingCart />);

    fireEvent.press(screen.getByLabelText('Increase quantity of Leak repair'));

    // The row count and the summed estimate follow the new quantity; the row
    // and the footer total agree.
    expect(screen.getByLabelText('Leak repair quantity 2')).toBeTruthy();
    expect(screen.getAllByText('₹498')).toHaveLength(2);
    expect(screen.getByText('1 work · 2 items')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Reduce quantity of Leak repair'));

    expect(screen.getByLabelText('Leak repair quantity 1')).toBeTruthy();
    expect(screen.getAllByText('₹249')).toHaveLength(2);
  });

  it('stops the quantity stepper at the work configured bounds', () => {
    const draft = useBookingDraft.getState();
    draft.start({ slug: 'plumbing', name: 'Plumbing' } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 5,
      durationMinutes: null,
      totalPaise: 124_500,
    });

    render(<BookingCart />);

    const increase = screen.getByLabelText('Increase quantity of Leak repair');
    expect(increase.props.accessibilityState).toEqual({ disabled: true });

    // The store clamps anyway: pressing through the disabled state cannot
    // push the quantity past the configured maximum.
    fireEvent.press(increase);
    expect(screen.getByLabelText('Leak repair quantity 5')).toBeTruthy();
  });

  it('adjusts a PER_HOUR work through the duration stepper', () => {
    const draft = useBookingDraft.getState();
    draft.start({ slug: 'plumbing', name: 'Plumbing' } as never);
    draft.addItem({
      skill: drainCleaning,
      customSkill: '',
      quantity: 1,
      durationMinutes: 60,
      totalPaise: 30_000,
    });

    render(<BookingCart />);

    expect(screen.getByLabelText('Drain cleaning duration 1 hr')).toBeTruthy();
    expect(screen.getAllByText('₹300')).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Increase duration of Drain cleaning'));

    expect(screen.getByLabelText('Drain cleaning duration 1.5 hr')).toBeTruthy();
    expect(screen.getAllByText('₹450')).toHaveLength(2);
  });

  it('asks before removing a work when its minus is pressed at the minimum', () => {
    const draft = useBookingDraft.getState();
    draft.start({ slug: 'plumbing', name: 'Plumbing' } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });
    draft.addItem({
      skill: drainCleaning,
      customSkill: '',
      quantity: 1,
      durationMinutes: 60,
      totalPaise: 30_000,
    });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    try {
      render(<BookingCart />);

      fireEvent.press(screen.getByLabelText('Reduce quantity of Leak repair'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Remove this work?',
        'Remove Leak repair from your cart?',
        expect.arrayContaining([expect.objectContaining({ text: 'Remove' })]),
      );
      // Nothing leaves the cart until the customer confirms.
      expect(screen.getByText('Leak repair')).toBeTruthy();

      const buttons = alertSpy.mock.calls[0]?.[2] as
        | { text?: string; onPress?: () => void }[]
        | undefined;
      act(() => {
        buttons?.find((button) => button.text === 'Remove')?.onPress?.();
      });

      expect(screen.queryByText('Leak repair')).toBeNull();
      expect(screen.getByText('Drain cleaning')).toBeTruthy();
      expect(screen.getByText('1 work')).toBeTruthy();
      // The row total and the visit total now agree on the single work left.
      expect(screen.getAllByText('₹300')).toHaveLength(2);
    } finally {
      alertSpy.mockRestore();
    }
  });

  it('returns to the catalogue to add more works', () => {
    const draft = useBookingDraft.getState();
    draft.start({ slug: 'plumbing', name: 'Plumbing' } as never);
    draft.addItem({
      skill: leakRepair,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });

    render(<BookingCart />);

    fireEvent.press(screen.getByText('Add more works'));

    expect(router.back).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

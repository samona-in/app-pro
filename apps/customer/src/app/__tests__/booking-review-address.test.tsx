import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import BookingReview from '../booking/new/[slug]/review';
import { useBookingDraft } from '@/stores/booking';

// Jest module factories are evaluated lazily, so their dependencies have to be
// pulled in with `require` rather than hoisted `import`s.
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// The review screen reads the services chosen on the cart screen from its
// route params; tests set `mockParams.services` per case.
const mockParams: { services?: string } = {};

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// `react-native-maps` needs native code; the probe reports when the map is
// ready and records the camera fits the screen asks for.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { jsx } = require('react/jsx-runtime');
  const { View } = require('react-native');

  const mapMethods = { fitToCoordinates: jest.fn() };

  const MapView = React.forwardRef(({ onMapReady, children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => mapMethods);
    React.useEffect(() => {
      onMapReady?.();
    }, [onMapReady]);

    return children;
  });

  const Marker = (props: any) => jsx(View, { ...props, testID: 'service-marker' });

  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_DEFAULT: undefined,
    __mapMethods: mapMethods,
  };
});

/**
 * `@gorhom/bottom-sheet` is native-heavy, so it is replaced with a probe. The
 * picker is driven through its ref (`snapToIndex` / `close`), so those methods
 * are shared spies that the tests assert against.
 */
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { jsx } = require('react/jsx-runtime');
  const { View } = require('react-native');

  const sheetMethods = { snapToIndex: jest.fn(), close: jest.fn() };

  const BottomSheet = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => sheetMethods);
    return jsx(View, {
      testID: 'bottom-sheet',
      children: [props.children, props.footerComponent?.({})],
    });
  });

  return {
    __esModule: true,
    default: BottomSheet,
    __sheetMethods: sheetMethods,
    BottomSheetBackdrop: () => null,
    BottomSheetFooter: (props: any) => props.children,
    BottomSheetScrollView: (props: any) => jsx(View, { children: props.children }),
    useBottomSheetSpringConfigs: () => ({}),
  };
});

jest.mock('@/hooks', () => {
  // Shared across renders so a test can resolve the mutation.
  const createBooking = { mutateAsync: jest.fn(), isPending: false, isError: false };

  return {
    useSession: () => ({ customerProfile: { latitude: 12.9, longitude: 77.5 } }),
    useActiveSavedAddress: () => undefined,
    useResolvedLocationLabel: () => 'Indiranagar, Bengaluru',
    useResolvedPlace: () => ({ data: null }),
    useSavedAddresses: () => ({
      data: [
        {
          id: 'addr-home',
          name: 'Home',
          label: 'HOME',
          addressLine1: '12, 4th Cross',
          addressLine2: null,
          landmark: null,
          locality: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560038',
          latitude: 12.97,
          longitude: 77.64,
          placeId: null,
          isDefault: true,
          createdAt: '2024-08-12T12:00:00.000Z',
          updatedAt: '2024-08-12T12:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    }),
    useCreateBooking: () => createBooking,
    useCreateBookingBatch: () => createBooking,
    __createBooking: createBooking,
  };
});

const { __sheetMethods } = jest.requireMock('@gorhom/bottom-sheet') as {
  __sheetMethods: { snapToIndex: jest.Mock; close: jest.Mock };
};

const { __mapMethods } = jest.requireMock('react-native-maps') as {
  __mapMethods: { fitToCoordinates: jest.Mock };
};

const { __createBooking } = jest.requireMock('@/hooks') as {
  __createBooking: { mutateAsync: jest.Mock };
};

describe('Booking review address picker', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockParams.services = undefined;
    // A checkout clears the cart on a zero-delay timer after navigating, so
    // let any pending timer from the previous test settle before seeding this
    // test's cart.
    await new Promise((resolve) => setTimeout(resolve, 0));
    useBookingDraft.getState().reset();
  });

  it('rests closed and opens from the edit affordance', () => {
    render(<BookingReview />);

    expect(screen.getAllByTestId('bottom-sheet')).toHaveLength(2);
    // The sheet starts below the screen while the picker is closed.
    expect(__sheetMethods.close).toHaveBeenCalled();
    expect(__sheetMethods.snapToIndex).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Change service address'));

    expect(__sheetMethods.snapToIndex).toHaveBeenCalledWith(0);
  });

  it('dismisses from the close icon', () => {
    render(<BookingReview />);

    fireEvent.press(screen.getByLabelText('Change service address'));
    __sheetMethods.close.mockClear();

    fireEvent.press(screen.getByLabelText('Close address picker'));

    expect(__sheetMethods.close).toHaveBeenCalled();
  });

  it('closes the picker and shows the chosen address in the preview', () => {
    render(<BookingReview />);

    // The fallback title appears on the preview row and on the map pin.
    expect(screen.getAllByText('Service location')).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Change service address'));
    __sheetMethods.close.mockClear();
    fireEvent.press(screen.getByText('Home'));

    expect(__sheetMethods.close).toHaveBeenCalled();
    expect(screen.queryByText('Service location')).toBeNull();
    // The preview row, the map pin and the (still mounted) picker row all
    // read "Home" once the pick is applied.
    expect(screen.getAllByText('Home')).toHaveLength(3);
  });

  it('hands the add-address action to the booking-scoped search flow', () => {
    render(<BookingReview />);

    fireEvent.press(screen.getByLabelText('Change service address'));
    __sheetMethods.close.mockClear();
    fireEvent.press(screen.getByLabelText('Add a new address'));

    expect(__sheetMethods.close).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/address-search',
      params: { mode: 'booking' },
    });
  });

  it('lands on the requests-sent summary for the checkout it just placed', async () => {
    useBookingDraft.getState().start({
      slug: 'electrician',
      name: 'Electrician',
    } as never);
    useBookingDraft.getState().addItem({
      skill: { id: 'sk-fan', slug: 'fan-installation', name: 'Fan installation' } as never,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 49_900,
    });
    __createBooking.mutateAsync.mockResolvedValueOnce({
      orderGroupId: 'group-42',
      jobs: [{ id: 'job-42' }],
    });

    render(<BookingReview />);
    fireEvent.press(screen.getByText('Place request'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/booking/requests-sent',
        params: { orderGroupId: 'group-42' },
      }),
    );
    // The finished flow pops back to the tabs (which host the active-job
    // hint); it must not push the summary over the review screen.
    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('places one checkout carrying every cart work, with no amounts attached', async () => {
    const draft = useBookingDraft.getState();
    draft.start({
      slug: 'plumbing',
      name: 'Plumbing',
    } as never);
    draft.addItem({
      skill: {
        id: 'sk-1',
        slug: 'leak-repair',
        name: 'Leak repair',
        pricingModel: 'PER_UNIT',
        basePricePaise: 24_900,
        unitLabel: 'tap',
        minQuantity: 1,
        maxQuantity: 5,
      } as never,
      customSkill: '',
      quantity: 3,
      durationMinutes: null,
      totalPaise: 74_700,
    });
    draft.addItem({
      skill: {
        id: 'sk-2',
        slug: 'other',
        name: 'Other',
        pricingModel: 'PER_BOOKING',
        basePricePaise: 29_900,
      } as never,
      customSkill: 'Bathroom reseal',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 29_900,
    });
    __createBooking.mutateAsync.mockResolvedValueOnce({
      orderGroupId: 'group-43',
      jobs: [{ id: 'job-43' }],
    });

    render(<BookingReview />);
    // The review summarises the visit as its works and their summed estimate.
    expect(screen.getByText('Leak repair + 1 more work')).toBeTruthy();
    expect(screen.getByText('2 works · 4 items')).toBeTruthy();
    expect(screen.getByText('₹1,046')).toBeTruthy();

    fireEvent.press(screen.getByText('Place request'));

    await waitFor(() => expect(__createBooking.mutateAsync).toHaveBeenCalledTimes(1));
    expect(__createBooking.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          {
            serviceSlug: 'plumbing',
            items: [
              { skillSlug: 'leak-repair', quantity: 3 },
              { skillSlug: 'other', customSkill: 'Bathroom reseal', quantity: 1 },
            ],
          },
        ],
      }),
    );
    // No price ever travels with the request: the server prices each work.
    const payload = __createBooking.mutateAsync.mock.calls[0][0];
    expect(payload).not.toHaveProperty('serviceSlug');
    expect(payload).not.toHaveProperty('basePayPaise');
    expect(JSON.stringify(payload)).not.toContain('totalPaise');
  });

  it('places a multi-service checkout as one request with a group per service', async () => {
    const draft = useBookingDraft.getState();
    draft.start({
      id: 'svc-plumbing',
      slug: 'plumbing',
      name: 'Plumbing',
    } as never);
    draft.addItem({
      skill: {
        id: 'sk-leak',
        slug: 'leak-repair',
        name: 'Leak repair',
        pricingModel: 'PER_BOOKING',
        basePricePaise: 24_900,
      } as never,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });
    draft.start({
      id: 'svc-electrical',
      slug: 'electrical',
      name: 'Electrical',
    } as never);
    draft.addItem({
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
    });
    __createBooking.mutateAsync.mockResolvedValueOnce({
      orderGroupId: 'group-44',
      jobs: [{ id: 'job-44' }, { id: 'job-45' }],
    });

    render(<BookingReview />);

    // The review shows every service and its works, with one combined estimate.
    expect(screen.getByText('2 services')).toBeTruthy();
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.getByText('Electrical')).toBeTruthy();
    expect(screen.getByText('₹549')).toBeTruthy();

    fireEvent.press(screen.getByText('Place request'));

    await waitFor(() => expect(__createBooking.mutateAsync).toHaveBeenCalledTimes(1));
    expect(__createBooking.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          {
            serviceSlug: 'plumbing',
            items: [{ skillSlug: 'leak-repair', quantity: 1 }],
          },
          {
            serviceSlug: 'electrical',
            items: [{ skillSlug: 'switch-repair', quantity: 2 }],
          },
        ],
      }),
    );
  });

  it('books only the services chosen on the cart and keeps the rest in the cart', async () => {
    const draft = useBookingDraft.getState();
    draft.start({
      id: 'svc-plumbing',
      slug: 'plumbing',
      name: 'Plumbing',
    } as never);
    draft.addItem({
      skill: {
        id: 'sk-leak',
        slug: 'leak-repair',
        name: 'Leak repair',
        pricingModel: 'PER_BOOKING',
        basePricePaise: 24_900,
      } as never,
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 24_900,
    });
    draft.start({
      id: 'svc-electrical',
      slug: 'electrical',
      name: 'Electrical',
    } as never);
    draft.addItem({
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
    });

    // The cart's selection sheet passed only the electrical service.
    mockParams.services = 'electrical';
    __createBooking.mutateAsync.mockResolvedValueOnce({
      orderGroupId: 'group-46',
      jobs: [{ id: 'job-46' }],
    });

    render(<BookingReview />);

    // Only the chosen service is reviewed, and the estimate follows it.
    expect(screen.getByText('Electrical')).toBeTruthy();
    expect(screen.queryByText('Plumbing')).toBeNull();
    expect(screen.getByText('₹300')).toBeTruthy();

    fireEvent.press(screen.getByText('Place request'));

    await waitFor(() => expect(__createBooking.mutateAsync).toHaveBeenCalledTimes(1));
    expect(__createBooking.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          {
            serviceSlug: 'electrical',
            items: [{ skillSlug: 'switch-repair', quantity: 2 }],
          },
        ],
      }),
    );

    // The deferred service stays in the cart for a later visit.
    await waitFor(() =>
      expect(useBookingDraft.getState().groups.map((group) => group.service.slug)).toEqual([
        'plumbing',
      ]),
    );
  });

  it('moves the pin and refits the map when the address changes', async () => {
    render(<BookingReview />);

    // The preview starts on the profile's active location.
    expect(screen.getByTestId('service-marker').props.coordinate).toEqual({
      latitude: 12.9,
      longitude: 77.5,
    });
    await waitFor(() => expect(__mapMethods.fitToCoordinates).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('Change service address'));
    fireEvent.press(screen.getByText('Home'));

    // The pin follows the picked saved address...
    expect(screen.getByTestId('service-marker').props.coordinate).toEqual({
      latitude: 12.97,
      longitude: 77.64,
    });

    // ...and the camera is fitted around the new pin, not the old one.
    await waitFor(() => {
      const lastFit = __mapMethods.fitToCoordinates.mock.calls.at(-1)?.[0];
      expect(lastFit).toEqual([
        { latitude: 12.97 - 0.0008, longitude: 77.64 - 0.0008 },
        { latitude: 12.97 + 0.0008, longitude: 77.64 + 0.0008 },
      ]);
    });
  });
});

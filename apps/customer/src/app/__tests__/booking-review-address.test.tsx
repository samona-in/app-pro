import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import BookingReview from '../booking/new/[slug]/review';
import { useBookingDraft } from '@/stores/booking';

// Jest module factories are evaluated lazily, so their dependencies have to be
// pulled in with `require` rather than hoisted `import`s.
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn() },
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
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('returns to the tabs and opens the booking it just placed', async () => {
    useBookingDraft.getState().start({
      slug: 'electrician',
      name: 'Electrician',
    } as never);
    useBookingDraft.getState().setSkill({
      slug: 'fan-installation',
      name: 'Fan installation',
    } as never);
    __createBooking.mutateAsync.mockResolvedValueOnce({ id: 'job-42' });

    render(<BookingReview />);
    fireEvent.press(screen.getByText('Place request'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/booking/[id]',
        params: { id: 'job-42' },
      }),
    );
    // The finished flow pops back to the tabs (which host the active-job
    // hint); it must not push the detail over the review screen.
    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
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

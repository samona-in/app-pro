import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import type { CustomerProfile } from '@samona/types';
import { customersApi } from '@/services/customer';
import { geocodingApi } from '@/services/geocoding';
import { readCurrentLocation } from '@/services/location';
import { useSession } from '../use-session';
import { useLiveLocation } from '../use-live-location';

jest.mock('../use-session', () => ({ useSession: jest.fn() }));
jest.mock('@/services/location', () => ({ readCurrentLocation: jest.fn() }));
jest.mock('@/services/geocoding', () => ({ geocodingApi: { reverse: jest.fn() } }));
jest.mock('@/services/customer', () => ({ customersApi: { updateLocation: jest.fn() } }));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockReadCurrentLocation = readCurrentLocation as jest.MockedFunction<
  typeof readCurrentLocation
>;
const mockReverse = geocodingApi.reverse as jest.MockedFunction<typeof geocodingApi.reverse>;
const mockUpdateLocation = customersApi.updateLocation as jest.MockedFunction<
  typeof customersApi.updateLocation
>;

/** Where the profile says the customer is — MG Road, Hyderabad. */
const STORED = { latitude: 17.385, longitude: 78.4867 };

/** Where the device says they are — Benz Circle, Vijayawada, about 60 km away. */
const LIVE = { latitude: 16.5062, longitude: 80.648 };

const profile = {
  id: 'cust-1',
  userId: 'user-1',
  onboardingStatus: 'COMPLETED',
  displayName: 'Priya Sharma',
  gender: 'FEMALE',
  locationLabel: 'MG Road, Hyderabad',
  locationPlaceId: 'ChIJmg-road',
  latitude: STORED.latitude,
  longitude: STORED.longitude,
  avatarUrl: null,
} as CustomerProfile;

const appStateListeners: Array<(state: AppStateStatus) => void> = [];

/** One client per test; cleared afterwards so its cache timers do not linger. */
let queryClient: QueryClient;

function session(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    isLoading: false,
    isAuthenticated: true,
    user: undefined,
    customerProfile: profile,
    onboardingStatus: 'COMPLETED',
    nextStep: undefined,
    isOnboardingComplete: true,
    error: undefined,
    refetch: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  } as ReturnType<typeof useSession>;
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Lets every pending promise in the sync settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe('useLiveLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListeners.length = 0;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: AppStateStatus) => void,
    ) => {
      appStateListeners.push(handler);
      return { remove: jest.fn() };
    }) as never);

    mockUseSession.mockReturnValue(session());
    mockReadCurrentLocation.mockResolvedValue({ status: 'granted', coordinates: LIVE });
    mockReverse.mockResolvedValue({
      formattedAddress: 'Benz Circle, Vijayawada',
      mainLabel: 'Benz Circle',
      secondary: null,
      locality: null,
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      postalCode: null,
      latitude: LIVE.latitude,
      longitude: LIVE.longitude,
      placeId: 'ChIJbenz-circle',
    });
    mockUpdateLocation.mockResolvedValue(profile);
  });

  afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('writes the live location to the profile when the app opens', async () => {
    renderHook(() => useLiveLocation(), { wrapper });

    await act(async () => {
      await flush();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).toHaveBeenCalledWith({
      coordinates: LIVE,
      locationLabel: 'Benz Circle, Vijayawada',
      locationPlaceId: 'ChIJbenz-circle',
    });
  });

  it('leaves the profile alone when the customer has not moved', async () => {
    mockReadCurrentLocation.mockResolvedValue({
      status: 'granted',
      coordinates: { latitude: STORED.latitude + 0.0002, longitude: STORED.longitude },
    });

    renderHook(() => useLiveLocation(), { wrapper });

    await act(async () => {
      await flush();
    });

    expect(mockReadCurrentLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('writes the coordinates even when the geocoder finds no place', async () => {
    mockReverse.mockRejectedValue(new Error('geocoder down'));

    renderHook(() => useLiveLocation(), { wrapper });

    await act(async () => {
      await flush();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).toHaveBeenCalledWith({ coordinates: LIVE });
  });

  it('does nothing when the permission is refused', async () => {
    mockReadCurrentLocation.mockResolvedValue({ status: 'denied' });

    renderHook(() => useLiveLocation(), { wrapper });

    await act(async () => {
      await flush();
    });

    expect(mockReadCurrentLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('does not read the location before onboarding is done', async () => {
    mockUseSession.mockReturnValue(session({ isOnboardingComplete: false }));

    renderHook(() => useLiveLocation(), { wrapper });

    await act(async () => {
      await flush();
    });

    expect(mockReadCurrentLocation).not.toHaveBeenCalled();
  });

  it('reads the location again when the app comes back to the foreground', async () => {
    const openedAt = Date.now();
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(openedAt);

    renderHook(() => useLiveLocation(), { wrapper });

    await act(async () => {
      await flush();
    });

    expect(mockReadCurrentLocation).toHaveBeenCalledTimes(1);

    now.mockReturnValue(openedAt + 60_000);

    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
      await flush();
    });

    expect(mockReadCurrentLocation).toHaveBeenCalledTimes(2);
  });
});

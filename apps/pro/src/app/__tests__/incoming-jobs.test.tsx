import { act, render, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import type * as ReactModule from 'react';
import * as Location from 'expo-location';
import { JobStatus, type Job } from '@samona/types';
import IncomingJobsScreen from '../(tabs)/incoming-jobs';
import { IncomingOffersSync } from '@/hooks/use-incoming-offers';
import { subscribe } from '@/services/realtime';
import { toPendingOfferFromPushData, useIncomingOffersStore } from '@/stores/incoming-offers';
import { api } from '@/services/api';

jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (component: unknown) => component },
  Easing: { linear: (value: number) => value },
  useSharedValue: (value: number) =>
    jest.requireActual<typeof ReactModule>('react').useRef({ value }).current,
  useAnimatedProps: (callback: () => unknown) => callback(),
  withTiming: (value: number) => value,
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/incoming-jobs',
}));
jest.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    isLoading: false,
    isAuthenticated: true,
    isOnboardingComplete: true,
    proProfile: { isOnline: true },
  }),
}));
jest.mock('@/hooks/use-jobs', () => ({ useProJobs: () => ({ data: [] }) }));
jest.mock('@/services/realtime', () => ({ subscribe: jest.fn(() => jest.fn()) }));
jest.mock('@/services/overlay-alert', () => ({
  getPendingNativeJobs: jest.fn().mockResolvedValue([]),
  clearNativeJobAlert: jest.fn().mockResolvedValue(undefined),
  setOverlaySuppressed: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/offer-actions', () => ({ offerActions: {} }));
jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const permission = jest.mocked(Location.getForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const watch = jest.mocked(Location.watchPositionAsync);

beforeAll(() => notifyManager.setNotifyFunction((callback) => act(callback)));
afterAll(() => notifyManager.setNotifyFunction((callback) => callback()));

// The server sends a Job DTO, with coordinates but no per-recipient distance.
function job(id: string, longitude: number): Job {
  return {
    id,
    customerId: 'customer',
    proId: null,
    service: { id: 'service', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' },
    skill: { id: 'skill', slug: 'fan-installation', name: 'Fan installation' },
    customSkill: null,
    status: JobStatus.REQUESTED,
    placeType: 'RESIDENCE',
    placeDescription: null,
    locationLabel: 'Main Road',
    latitude: 0,
    longitude,
    description: 'Install a fan',
    imageUrls: [],
    basePayPaise: 8800,
    agreedPayPaise: null,
    finalPayPaise: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function fix(longitude: number): Location.LocationObject {
  return {
    coords: {
      latitude: 0,
      longitude,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

function arrive(payload: Job) {
  const handler = jest.mocked(subscribe).mock.calls.find(([event]) => event === 'job:new')?.[1];
  if (!handler) throw new Error('No incoming-job listener');
  act(() => (handler as (value: Job) => void)(payload));
}

async function showRequests() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <IncomingOffersSync />
      <IncomingJobsScreen />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  useIncomingOffersStore.setState({ offersById: {}, now: Date.now() });
  permission.mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  } as Location.LocationPermissionResponse);
  position.mockResolvedValue(fix(0));
  watch.mockResolvedValue({ remove: jest.fn() });
});

it('updates every socket request when the initial location arrives, without interaction', async () => {
  let resolvePosition!: (value: Location.LocationObject) => void;
  position.mockReturnValue(
    new Promise((resolve) => {
      resolvePosition = resolve;
    }),
  );
  const view = await showRequests();
  arrive(job('one', 0.01));
  arrive(job('two', 0.02));

  expect(view.getAllByText('Calculating distance...')).toHaveLength(2);
  await waitFor(() => expect(position).toHaveBeenCalled());
  await act(async () => resolvePosition(fix(0)));

  expect(view.getByText('1.1 km away')).toBeTruthy();
  expect(view.getByText('2.2 km away')).toBeTruthy();
  expect(view.queryByText('Calculating distance...')).toBeNull();
});

it('calculates new arrivals immediately and updates memoized cards when the pro moves', async () => {
  const view = await showRequests();
  arrive(job('one', 0.01));
  await waitFor(() => expect(watch).toHaveBeenCalled());
  arrive(job('two', 0.02));
  expect(view.getByText('1.1 km away')).toBeTruthy();
  expect(view.getByText('2.2 km away')).toBeTruthy();

  act(() => watch.mock.calls[0]![1](fix(0.01)));
  expect(view.getByText('0 m away')).toBeTruthy();
  expect(view.getByText('1.1 km away')).toBeTruthy();
  arrive(job('three', 0.03));
  expect(view.getByText('2.2 km away')).toBeTruthy();
  expect(watch).toHaveBeenCalledTimes(1);
});

it.each(['denied', 'failed'] as const)('shows unavailable when location is %s', async (failure) => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  if (failure === 'denied') {
    permission.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as Location.LocationPermissionResponse);
  } else {
    position.mockRejectedValue(new Error('GPS unavailable'));
  }
  const view = await showRequests();
  arrive(job('one', 0.01));
  await waitFor(() => expect(view.getByText('Distance unavailable')).toBeTruthy());
  warning.mockRestore();
});

it('hydrates a native offer missing job coordinates and then follows live location', async () => {
  jest.mocked(api.get).mockResolvedValue(job('native', 0.02));
  const view = await showRequests();
  act(() =>
    useIncomingOffersStore.getState().upsert({
      jobId: 'native',
      title: 'Electrical job',
      serviceName: 'Electrical',
      serviceCategory: null,
      address: 'Main Road',
      distanceMeters: 2200,
      amountPaise: 8800,
      expiresAt: null,
      offerExpiresAt: null,
      jobOfferToken: null,
      receivedAt: Date.now(),
    }),
  );
  await waitFor(() => expect(view.getByText('2.2 km away')).toBeTruthy());
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/jobs/native'));
  act(() => watch.mock.calls[0]![1](fix(0.01)));
  expect(view.getByText('1.1 km away')).toBeTruthy();
});

it('shows calculating while GPS is pending even when push includes an old distance snapshot', async () => {
  let resolve!: (value: Location.LocationObject) => void;
  position.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  jest.mocked(api.get).mockResolvedValue(job('push', 0.02));
  const view = await showRequests();
  const offer = toPendingOfferFromPushData({ jobId: 'push', distanceMeters: '999' });
  if (!offer) throw new Error('Push offer was not parsed');
  act(() => useIncomingOffersStore.getState().upsert(offer));
  expect(view.getByText('Calculating distance...')).toBeTruthy();
  await waitFor(() => expect(position).toHaveBeenCalled());
  await act(async () => resolve(fix(0)));
  await waitFor(() => expect(view.getByText('2.2 km away')).toBeTruthy());
});

it('shows unavailable after native coordinate hydration fails instead of keeping a stale snapshot', async () => {
  jest.mocked(api.get).mockRejectedValue(new Error('Job lookup unavailable'));
  const view = await showRequests();
  act(() =>
    useIncomingOffersStore.getState().upsert({
      jobId: 'native',
      title: 'Electrical job',
      serviceName: 'Electrical',
      serviceCategory: null,
      address: 'Main Road',
      distanceMeters: 2200,
      amountPaise: 8800,
      expiresAt: null,
      offerExpiresAt: null,
      jobOfferToken: null,
      receivedAt: Date.now(),
    }),
  );
  await waitFor(() => expect(view.getByText('Distance unavailable')).toBeTruthy());
  act(() => watch.mock.calls[0]![1](fix(0.01)));
  expect(view.queryByText('2.2 km away')).toBeNull();
});

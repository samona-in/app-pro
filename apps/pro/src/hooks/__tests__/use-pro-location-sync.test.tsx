import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useProLocationSync } from '../use-pro-location-sync';
import { useProLocationStore } from '@/stores/pro-location';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const permission = jest.mocked(Location.getForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const watch = jest.mocked(Location.watchPositionAsync);
const granted = {
  status: 'granted',
  granted: true,
  canAskAgain: true,
  expires: 'never',
} as Location.LocationPermissionResponse;
const fix: Location.LocationObject = {
  coords: {
    latitude: 12.97,
    longitude: 77.6,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
};
let changeState: (state: AppStateStatus) => void;

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  useProLocationStore.getState().reset();
  permission.mockResolvedValue(granted);
  position.mockResolvedValue(fix);
  watch.mockResolvedValue({ remove: jest.fn() });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeState = listener;
    return { remove: jest.fn() };
  });
});

afterEach(() => jest.restoreAllMocks());

it('ignores an in-flight fix after the location owner unmounts', async () => {
  let resolve!: (value: Location.LocationObject) => void;
  position.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(position).toHaveBeenCalled());
  const watcher = await watch.mock.results[0]!.value;
  view.unmount();
  await act(async () => resolve(fix));

  expect(useProLocationStore.getState().coordinates).toBeNull();
  expect(watcher.remove).toHaveBeenCalled();
});

it('removes a watcher that finishes registering after backgrounding and ignores its callbacks', async () => {
  const remove = jest.fn();
  let resolve!: (value: Location.LocationSubscription) => void;
  watch.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(watch).toHaveBeenCalled());

  act(() => changeState('background'));
  await act(async () => resolve({ remove }));
  expect(remove).toHaveBeenCalledTimes(1);
  act(() => watch.mock.calls[0]![1]({ ...fix, coords: { ...fix.coords, longitude: 78 } }));
  expect(useProLocationStore.getState().coordinates).toEqual({ latitude: 12.97, longitude: 77.6 });
});

it('rechecks permission on foreground and recovers after permission is restored', async () => {
  permission.mockResolvedValueOnce({
    ...granted,
    status: 'denied',
    granted: false,
  } as Location.LocationPermissionResponse);
  renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(useProLocationStore.getState().status).toBe('unavailable'));
  expect(position).not.toHaveBeenCalled();

  act(() => changeState('background'));
  act(() => changeState('active'));
  await waitFor(() => expect(useProLocationStore.getState().status).toBe('ready'));
  expect(useProLocationStore.getState().coordinates).toEqual({ latitude: 12.97, longitude: 77.6 });
});

it('clears coordinates on a watcher error and recovers on its next fix', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(watch).toHaveBeenCalled());
  act(() => watch.mock.calls[0]![2]!('GPS disabled'));
  expect(useProLocationStore.getState().status).toBe('unavailable');
  expect(useProLocationStore.getState().coordinates).toBeNull();

  act(() => watch.mock.calls[0]![1](fix));
  expect(useProLocationStore.getState().status).toBe('ready');
});

it('recovers through a real location event after the initial position read fails', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  position.mockRejectedValue(new Error('No initial GPS fix'));
  renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(useProLocationStore.getState().status).toBe('unavailable'));
  expect(watch).toHaveBeenCalledTimes(1);

  act(() => watch.mock.calls[0]![1](fix));
  expect(useProLocationStore.getState().coordinates).toEqual({ latitude: 12.97, longitude: 77.6 });
  expect(useProLocationStore.getState().status).toBe('ready');
});

it('does not let a late initial read failure overwrite a newer watch fix', async () => {
  let reject!: (error: Error) => void;
  position.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(watch).toHaveBeenCalled());
  act(() => watch.mock.calls[0]![1](fix));
  await act(async () => reject(new Error('Initial read failed late')));
  expect(useProLocationStore.getState().status).toBe('ready');
  expect(useProLocationStore.getState().coordinates).toEqual({ latitude: 12.97, longitude: 77.6 });
});

it('keeps distance unavailable if watcher registration fails before a late initial fix', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  let resolve!: (value: Location.LocationObject) => void;
  position.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  watch.mockRejectedValue(new Error('Cannot watch location'));
  renderHook(() => useProLocationSync(true));
  await waitFor(() => expect(useProLocationStore.getState().status).toBe('unavailable'));
  await act(async () => resolve(fix));
  expect(useProLocationStore.getState().status).toBe('unavailable');
  expect(useProLocationStore.getState().coordinates).toBeNull();
});

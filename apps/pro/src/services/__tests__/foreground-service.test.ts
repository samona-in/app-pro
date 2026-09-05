import { Platform } from 'react-native';
import type * as ExpoModulesCore from 'expo-modules-core';
import {
  initializeJobAlertService,
  startJobAlertService,
  stopJobAlertService,
} from '../foreground-service';

type OnlineState = { status: string; isTransitioning: boolean };

const mockModule = {
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
};

const mockSubscribers = new Set<(state: OnlineState) => void>();

jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual<typeof ExpoModulesCore>('expo-modules-core');
  return {
    ...actual,
    requireNativeModule: (name: string, ...args: never[]) =>
      name === 'SamonaJobAlertBackground'
        ? mockRequireNativeModule(name, ...args)
        : (actual.requireNativeModule as (name: string, ...args: never[]) => unknown)(
            name,
            ...args,
          ),
  };
});

jest.mock('../online-status-state', () => ({
  subscribeToOnlineStatus: (listener: (state: OnlineState) => void): (() => void) => {
    mockSubscribers.add(listener);
    return () => mockSubscribers.delete(listener);
  },
}));

const mockRequireNativeModule = jest.fn();

function emit(status: string, isTransitioning = false): void {
  mockSubscribers.forEach((listener) => listener({ status, isTransitioning }));
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  mockRequireNativeModule.mockReturnValue(mockModule);
  mockSubscribers.clear();
  mockModule.start.mockClear();
  mockModule.stop.mockClear();
});

it('calls the native module from the direct helpers', () => {
  startJobAlertService();
  stopJobAlertService();
  expect(mockModule.start).toHaveBeenCalledTimes(1);
  expect(mockModule.stop).toHaveBeenCalledTimes(1);
});

it('is a no-op off Android', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  startJobAlertService();
  stopJobAlertService();
  expect(mockModule.start).not.toHaveBeenCalled();
  expect(mockModule.stop).not.toHaveBeenCalled();
});

describe('online-status mirror', () => {
  it('starts the service when the pro goes online and stops when offline', () => {
    initializeJobAlertService();
    emit('online');
    expect(mockModule.start).toHaveBeenCalledTimes(1);

    emit('offline');
    expect(mockModule.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores the transitional loading state and mid-toggle offline', () => {
    initializeJobAlertService();
    emit('loading');
    emit('offline', true);
    expect(mockModule.start).not.toHaveBeenCalled();
    expect(mockModule.stop).not.toHaveBeenCalled();
  });

  it('restarts after a fresh launch reconciles to still-online', () => {
    initializeJobAlertService();
    emit('offline'); // launch default, not yet reconciled
    emit('online'); // profile load says the pro is still online
    expect(mockModule.start).toHaveBeenCalledTimes(1);
    expect(mockModule.stop).toHaveBeenCalledTimes(1);
  });

  it('re-initializes cleanly, replacing the previous mirror', () => {
    initializeJobAlertService();
    initializeJobAlertService(); // e.g. the tabs layout re-fires after re-login
    emit('online');
    expect(mockModule.start).toHaveBeenCalledTimes(1);
  });
});

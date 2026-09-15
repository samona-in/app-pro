import { Platform } from 'react-native';
import type * as ExpoModulesCore from 'expo-modules-core';
import { reconcileFloatingBubble } from '../floating-bubble';

const mockModule = {
  reconcileBubble: jest.fn().mockResolvedValue(true),
};

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

const mockRequireNativeModule = jest.fn();

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  mockRequireNativeModule.mockReturnValue(mockModule);
  mockModule.reconcileBubble.mockClear();
});

it('reconciles the native bubble on Android', async () => {
  await reconcileFloatingBubble();
  expect(mockModule.reconcileBubble).toHaveBeenCalledTimes(1);
});

it('is a no-op off Android', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await reconcileFloatingBubble();
  expect(mockModule.reconcileBubble).not.toHaveBeenCalled();
});

it('is a no-op when the native module is missing', async () => {
  mockRequireNativeModule.mockImplementation(() => {
    throw new Error('NativeModule: null');
  });
  await expect(reconcileFloatingBubble()).resolves.toBeUndefined();
  expect(mockModule.reconcileBubble).not.toHaveBeenCalled();
});

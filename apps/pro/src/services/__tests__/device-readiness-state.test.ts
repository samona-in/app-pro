import * as Notifications from 'expo-notifications';
import {
  checkDeviceReadiness,
  isDeviceReady,
  missingReadinessCount,
  type DeviceReadiness,
} from '../device-readiness-state';
import { readPowerState } from '../device-readiness';
import { isFullScreenIntentEnabled, isFullScreenIntentSupported } from '../full-screen-alert';
import { isOverlayPermissionEnabled } from '../overlay-alert';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
}));

jest.mock('../device-readiness', () => ({
  readPowerState: jest.fn(),
}));

jest.mock('../full-screen-alert', () => ({
  isFullScreenIntentEnabled: jest.fn(),
  isFullScreenIntentSupported: jest.fn(),
}));

jest.mock('../overlay-alert', () => ({
  isOverlayPermissionEnabled: jest.fn(),
}));

const ALL_SET: DeviceReadiness = {
  notificationsEnabled: true,
  fullScreenAlertsEnabled: true,
  overlayPermissionEnabled: true,
  batteryOptimizationIgnored: true,
  backgroundDataAllowed: true,
};

describe('device readiness helpers', () => {
  it('isDeviceReady requires every setting', () => {
    expect(isDeviceReady(ALL_SET)).toBe(true);
    expect(isDeviceReady({ ...ALL_SET, notificationsEnabled: false })).toBe(false);
  });

  it('missingReadinessCount counts only the off settings', () => {
    expect(missingReadinessCount(ALL_SET)).toBe(0);
    expect(
      missingReadinessCount({
        ...ALL_SET,
        batteryOptimizationIgnored: false,
        backgroundDataAllowed: false,
      }),
    ).toBe(2);
  });
});

describe('checkDeviceReadiness on iOS', () => {
  it('reports all clear (no Android-specific settings to check)', async () => {
    await expect(checkDeviceReadiness()).resolves.toEqual(ALL_SET);
  });
});

describe('checkDeviceReadiness on Android', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns all clear when every probe passes', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (isFullScreenIntentSupported as jest.Mock).mockReturnValue(true);
    (isFullScreenIntentEnabled as jest.Mock).mockResolvedValue(true);
    (isOverlayPermissionEnabled as jest.Mock).mockResolvedValue(true);
    (readPowerState as jest.Mock).mockResolvedValue({
      batteryOptimizationIgnored: true,
      backgroundDataAllowed: true,
    });

    await expect(checkDeviceReadiness('android')).resolves.toEqual(ALL_SET);
  });

  it('reports each missing setting', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    (isFullScreenIntentSupported as jest.Mock).mockReturnValue(true);
    (isFullScreenIntentEnabled as jest.Mock).mockResolvedValue(false);
    (isOverlayPermissionEnabled as jest.Mock).mockResolvedValue(true);
    (readPowerState as jest.Mock).mockResolvedValue({
      batteryOptimizationIgnored: false,
      backgroundDataAllowed: true,
    });

    const result = await checkDeviceReadiness('android');
    expect(result).toEqual({
      notificationsEnabled: false,
      fullScreenAlertsEnabled: false,
      overlayPermissionEnabled: true,
      batteryOptimizationIgnored: false,
      backgroundDataAllowed: true,
    });
    expect(isDeviceReady(result)).toBe(false);
    expect(missingReadinessCount(result)).toBe(3);
  });

  it('measures the overlay permission but never counts it as blocking', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (isFullScreenIntentSupported as jest.Mock).mockReturnValue(true);
    (isFullScreenIntentEnabled as jest.Mock).mockResolvedValue(true);
    (isOverlayPermissionEnabled as jest.Mock).mockResolvedValue(false);
    (readPowerState as jest.Mock).mockResolvedValue({
      batteryOptimizationIgnored: true,
      backgroundDataAllowed: true,
    });

    const result = await checkDeviceReadiness('android');
    expect(result.overlayPermissionEnabled).toBe(false);
    // Non-blocking: with every blocking metric on, the device is still ready.
    expect(isDeviceReady(result)).toBe(true);
    expect(missingReadinessCount(result)).toBe(0);
  });

  it('treats an unmeasurable full-screen module as allowed', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (isFullScreenIntentSupported as jest.Mock).mockReturnValue(false);
    (isOverlayPermissionEnabled as jest.Mock).mockResolvedValue(false);
    (readPowerState as jest.Mock).mockResolvedValue({
      batteryOptimizationIgnored: true,
      backgroundDataAllowed: true,
    });

    const result = await checkDeviceReadiness('android');
    expect(result.fullScreenAlertsEnabled).toBe(true);
    expect(isFullScreenIntentEnabled).not.toHaveBeenCalled();
  });
});

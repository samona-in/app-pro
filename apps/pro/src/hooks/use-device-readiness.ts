import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  type DeviceReadiness,
  getDeviceReadiness,
  isDeviceReady,
  refreshDeviceReadiness,
  subscribeToDeviceReadiness,
} from '@/services/device-readiness-state';

/**
 * Subscribes to the cached device-readiness result, re-probes on mount, and
 * re-probes whenever the app returns to the foreground — which is exactly when
 * a pro lands back from fixing a setting, so the banner and setup screen update
 * without a manual refresh.
 */
export function useDeviceReadiness() {
  const [readiness, setReadiness] = useState<DeviceReadiness | null>(() => getDeviceReadiness());

  useEffect(() => {
    const unsubscribe = subscribeToDeviceReadiness(setReadiness);
    void refreshDeviceReadiness();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshDeviceReadiness();
      }
    });
    return () => subscription.remove();
  }, []);

  return {
    readiness,
    isReady: readiness !== null && isDeviceReady(readiness),
    refreshDeviceReadiness,
  };
}

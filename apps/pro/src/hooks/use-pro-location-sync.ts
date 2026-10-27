import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useProLocationStore } from '@/stores/pro-location';

/** Mounted once by IncomingOffersSync; cards only subscribe to the shared store. */
export function useProLocationSync(enabled: boolean): void {
  useEffect(() => {
    const store = useProLocationStore.getState();
    if (!enabled) {
      store.reset();
      return;
    }

    let generation = 0;
    let subscription: Location.LocationSubscription | null = null;
    function stop() {
      generation += 1;
      subscription?.remove();
      subscription = null;
    }

    async function start() {
      stop();
      const current = generation;
      const active = () => current === generation;
      // A new foreground session can recover a failed fix or a permission
      // granted in Settings. Going online already owns the permission prompt.
      if (!useProLocationStore.getState().coordinates) store.reset();
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!active()) return;
        if (status !== 'granted') {
          store.setUnavailable();
          return;
        }
        // Seed promptly, but register the watcher independently so a failed
        // first read can recover on the next real GPS event. A late one-shot
        // result must never overwrite a more recent watch event.
        let watchUpdated = false;
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(
          ({ coords }) => {
            if (active() && !watchUpdated) {
              store.setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
            }
          },
          (error: unknown) => {
            if (!active() || watchUpdated) return;
            console.warn('[ProLocation] Could not read location', error);
            store.setUnavailable();
          },
        );
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
          ({ coords }) => {
            if (active()) {
              watchUpdated = true;
              store.setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
            }
          },
          (error) => {
            if (!active()) return;
            watchUpdated = true;
            console.warn('[ProLocation] Location update failed', error);
            store.setUnavailable();
          },
        );
        if (active()) subscription = watcher;
        else watcher.remove();
      } catch (error) {
        if (!active()) return;
        // A watcher that could not register cannot keep this snapshot live.
        // Invalidate its pending seed as well as any late native callbacks.
        stop();
        console.warn('[ProLocation] Could not read location', error);
        store.setUnavailable();
      }
    }

    if (AppState.currentState === 'active' || AppState.currentState == null) void start();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void start();
      else stop();
    });
    return () => {
      stop();
      listener.remove();
      store.reset();
    };
  }, [enabled]);
}

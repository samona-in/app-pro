import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useProLocationStore } from '@/stores/pro-location';

/**
 * One shared foreground location watcher.
 *
 * Several surfaces need the same "where is the pro right now" snapshot: the
 * incoming-offer cards (for distances) and the Home map (for the marker).
 * Registering a watcher per consumer would multiply GPS reads and battery use,
 * so this module owns a single ref-counted subscription while any consumer is
 * mounted. It still stops the moment the app backgrounds — background tracking
 * belongs to an active job, not to idling online.
 */
let ownerCount = 0;
let running = false;
let generation = 0;
let subscription: Location.LocationSubscription | null = null;
let appStateSubscription: { remove: () => void } | null = null;

function stopWatcher(): void {
  generation += 1;
  subscription?.remove();
  subscription = null;
}

/**
 * (Re)starts the watcher for the current foreground session.
 *
 * Exported indirectly through `retryProLocationSync` so the map can recover
 * after the pro grants permission in Settings without remounting the screen.
 */
async function startWatcher(): Promise<void> {
  stopWatcher();
  const current = generation;
  const active = () => current === generation;
  const store = useProLocationStore.getState();

  // A new foreground session can recover a failed fix or a permission granted
  // in Settings. Going online already owns the permission prompt.
  if (!store.coordinates) store.reset();

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (!active()) return;
    if (status !== 'granted') {
      store.setUnavailable('permission');
      return;
    }

    // Seed promptly, but register the watcher independently so a failed first
    // read can recover on the next real GPS event. A late one-shot result must
    // never overwrite a more recent watch event.
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
    stopWatcher();
    console.warn('[ProLocation] Could not read location', error);
    store.setUnavailable();
  }
}

function start(): void {
  if (running) return;
  running = true;
  if (AppState.currentState === 'active' || AppState.currentState == null) {
    void startWatcher();
  }
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void startWatcher();
    else stopWatcher();
  });
}

function stop(): void {
  if (!running) return;
  running = false;
  stopWatcher();
  appStateSubscription?.remove();
  appStateSubscription = null;
  useProLocationStore.getState().reset();
}

/**
 * Re-runs permission/position reads without remounting the consumer. Used by
 * the Home map's recovery actions after the pro returns from Settings.
 */
export function retryProLocationSync(): void {
  if (running) void startWatcher();
}

/**
 * Keeps the shared location snapshot live while `enabled` is true.
 *
 * Returns a retry callback. Consumers never own a watcher directly, so any
 * number of them can call this without duplicating GPS subscriptions.
 */
export function useProLocationSync(enabled = true): () => void {
  useEffect(() => {
    if (!enabled) return;
    ownerCount += 1;
    if (ownerCount === 1) start();

    return () => {
      ownerCount = Math.max(0, ownerCount - 1);
      if (ownerCount === 0) stop();
    };
  }, [enabled]);

  return retryProLocationSync;
}

import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { customersApi } from '@/services/customer';
import { geocodingApi } from '@/services/geocoding';
import { readCurrentLocation } from '@/services/location';
import { useAppStore } from '@/stores/app';
import { distanceMeters } from '@/utils/geo';
import { useSession } from './use-session';

/**
 * How far the customer must have moved before the stored location is
 * rewritten. A fix indoors drifts by tens of metres; 100 m is past that noise
 * and still short of a real move.
 */
const MOVE_THRESHOLD_METERS = 100;

/**
 * The shortest gap between two reads, so returning to the app cannot turn
 * into a burst of writes.
 */
const MIN_REFRESH_INTERVAL_MS = 60_000;

/**
 * Keeps the customer's active location in step with where they are.
 *
 * A customer opens the app at home, at the office, or anywhere in between.
 * Making them walk to a location screen to say so is busywork, so the app
 * reads the device's own position when it opens and again whenever it comes
 * back to the foreground, then writes it to the profile the bookings are
 * placed against.
 *
 * Best effort by design: a refused permission, a missing fix or a dead
 * network leaves the customer with the location they already had, and they can
 * always change it by hand from the home header.
 */
export function useLiveLocation(): void {
  const { isAuthenticated, isOnboardingComplete, customerProfile } = useSession();
  const queryClient = useQueryClient();
  const setCoordinates = useAppStore((state) => state.setCoordinates);

  // The profile is read through a ref so a background refetch of the session
  // never re-runs the sync.
  const profileRef = useRef(customerProfile);

  useEffect(() => {
    profileRef.current = customerProfile;
  }, [customerProfile]);

  const reading = useRef(false);
  const lastReadAt = useRef(0);

  const sync = useCallback(async () => {
    if (reading.current) return;

    const now = Date.now();
    if (now - lastReadAt.current < MIN_REFRESH_INTERVAL_MS) return;
    lastReadAt.current = now;
    reading.current = true;

    try {
      const read = await readCurrentLocation();
      if (read.status !== 'granted') return;

      setCoordinates(read.coordinates.latitude, read.coordinates.longitude);

      const profile = profileRef.current;
      const stored =
        profile?.latitude != null && profile.longitude != null
          ? { latitude: profile.latitude, longitude: profile.longitude }
          : null;

      // Already where the profile says they are: nothing to write.
      if (stored && distanceMeters(stored, read.coordinates) < MOVE_THRESHOLD_METERS) {
        return;
      }

      // The label is a nicety — the coordinates are the location. A geocoder
      // that is down must not cost the customer their position.
      const place = await geocodingApi
        .reverse(read.coordinates.latitude, read.coordinates.longitude)
        .catch(() => null);

      const updated = await customersApi.updateLocation({
        coordinates: read.coordinates,
        ...(place ? { locationLabel: place.formattedAddress, locationPlaceId: place.placeId } : {}),
      });

      queryClient.setQueryData(queryKeys.customerProfile, updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    } catch (error) {
      // Not worth a dialog: the customer keeps the location they already had.
      console.warn('[LiveLocation] could not refresh the live location', error);
    } finally {
      reading.current = false;
    }
  }, [queryClient, setCoordinates]);

  // Onboarding owns the location until it is done — the customer picks a
  // place there, and a live fix would fight that choice.
  const active = isAuthenticated && isOnboardingComplete;

  useEffect(() => {
    if (!active) return;
    void sync();
  }, [active, sync]);

  useEffect(() => {
    if (!active) return;

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void sync();
    });

    return () => subscription.remove();
  }, [active, sync]);
}

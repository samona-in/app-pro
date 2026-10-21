import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** The outcome of a location read: coordinates, or the reason there are none. */
export type LocationRead =
  | { status: 'granted'; coordinates: Coordinates }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * Reads the device's current position.
 *
 * Foreground permission only: the app needs a spot while it is open, never a
 * trail (CLAUDE.md "Location"). The permission is asked for the first time the
 * location is needed and never again after a refusal — the OS prompt carries
 * the app's own reason (`NSLocationWhenInUseUsageDescription`), and a customer
 * who said no keeps the location they picked by hand.
 *
 * A missing fix is not an error. Location services can be switched off and
 * the device can be indoors with no signal; both leave the customer exactly
 * where they were.
 */
export async function readCurrentLocation(): Promise<LocationRead> {
  const existing = await Location.getForegroundPermissionsAsync();

  let granted = existing.granted;
  if (!granted && existing.status === 'undetermined') {
    granted = (await Location.requestForegroundPermissionsAsync()).granted;
  }

  if (!granted) return { status: 'denied' };

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      status: 'granted',
      coordinates: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

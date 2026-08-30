import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Reads the device's current position, requesting permission when needed.
 *
 * Permission is requested only at the moment the Pro goes online, and the
 * system prompt explains why (CLAUDE.md "Location"). Matching against live
 * coordinates is the whole point of the online state, so losing this should
 * stop the Pro from going online rather than silently matching blind.
 */
export async function readCurrentLocation(): Promise<Coordinates> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is needed to go online and match with jobs near you.');
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

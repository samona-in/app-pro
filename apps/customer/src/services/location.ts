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

/** A GPS fix can stall indoors; a picker must not spin forever on one. */
const PRECISE_FIX_TIMEOUT_MS = 8_000;

/** Reading the OS's cached fix is local and immediate; it only needs a guard. */
const CACHE_READ_TIMEOUT_MS = 2_000;

/** How old a cached fix may be and still describe the customer's block. */
const CACHED_FIX_MAX_AGE_MS = 10 * 60_000;

/** Accuracy radius, in metres, a cached fix must meet to be worth using. */
const CACHED_FIX_MAX_ACCURACY_METERS = 50;

function toCoordinates(position: Location.LocationObject): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/** Settles with the promise's value, or `null` when it rejects or `ms` elapse. */
async function settleWithin<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });

  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the device's position for a map where the exact house matters.
 *
 * The spot pickers need the building, not the neighbourhood, so they ask for a
 * GPS-grade fix instead of the balanced one the silent background sync uses.
 * That fix can take a while indoors or fail outright; when it does, the most
 * recent cached fix (still good to the block) and then a balanced fix are
 * tried, so the customer gets the closest answer the device can give. `null`
 * means the device has nothing to offer and the map should stay where it is.
 */
export async function readPreciseLocation(): Promise<Coordinates | null> {
  const precise = await settleWithin(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
    PRECISE_FIX_TIMEOUT_MS,
  );
  if (precise) return toCoordinates(precise);

  const cached = await settleWithin(
    Location.getLastKnownPositionAsync({
      maxAge: CACHED_FIX_MAX_AGE_MS,
      requiredAccuracy: CACHED_FIX_MAX_ACCURACY_METERS,
    }),
    CACHE_READ_TIMEOUT_MS,
  );
  if (cached) return toCoordinates(cached);

  const balanced = await settleWithin(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    PRECISE_FIX_TIMEOUT_MS,
  );
  return balanced ? toCoordinates(balanced) : null;
}

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

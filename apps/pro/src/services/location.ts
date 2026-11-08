import * as Location from 'expo-location';
import { i18nInstance } from '@/i18n';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** A GPS fix can stall indoors; a picker must not spin forever on one. */
const PRECISE_FIX_TIMEOUT_MS = 8_000;

/** Reading the OS's cached fix is local and immediate; it only needs a guard. */
const CACHE_READ_TIMEOUT_MS = 2_000;

/** How old a cached fix may be and still describe the Pro's work area. */
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
 * Reads the device's position for a map where the exact spot matters.
 *
 * The onboarding service-area map needs the building, not the neighbourhood, so
 * it asks for a GPS-grade fix instead of the balanced one the online state uses.
 * That fix can take a while indoors or fail outright; when it does, the most
 * recent cached fix (still good to the block) and then a balanced fix are tried,
 * so the Pro gets the closest answer the device can give. `null` means the
 * device has nothing to offer and the map should stay where it is.
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
    throw new Error(i18nInstance.t('onlineStatus.permNeeded'));
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

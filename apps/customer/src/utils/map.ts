import type { Region } from 'react-native-maps';

/**
 * Frames the camera the way the app thinks about it (a centre and a zoom),
 * translated into the Region react-native-maps expects.
 *
 * react-native-maps has no zoom level; a Web-Mercator zoom maps to a
 * latitude/longitude delta by `delta = 360 / 2^zoom`. The same delta is used
 * for both axes — the map keeps its own aspect ratio from there.
 *
 * `center` is `[lng, lat]`, matching the coordinates the map APIs and the rest
 * of the app exchange.
 */
export function regionFor(center: [number, number], zoom: number): Region {
  const delta = 360 / Math.pow(2, zoom);
  return {
    latitude: center[1],
    longitude: center[0],
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

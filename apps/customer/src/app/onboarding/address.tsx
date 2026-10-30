import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StepProgress } from '@/components/onboarding';
import { Button, Text } from '@/components/ui';
import { useCustomerProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';
import { readPreciseLocation } from '@/services/location';
import { color, elevation } from '@/theme';
import { CITY_ZOOM, STREET_ZOOM, regionFor } from '@/utils/map';

interface Coordinates {
  latitude: number;
  longitude: number;
}

const INITIAL_CENTER: [number, number] = [77.209, 28.6139]; // [lng, lat] — India-first default

/** Height reserved for the two lines of the resolved address, so the panel never jumps. */
const ADDRESS_LINE_HEIGHT = 44;

/** The selection marker: a 44 px disc with an 8 px needle whose tip is the pick. */
const MARKER_SIZE = 44;
const MARKER_NEEDLE = 8;

const styles = StyleSheet.create({
  marker: {
    alignItems: 'center',
    transform: [{ translateY: -(MARKER_SIZE + MARKER_NEEDLE) / 2 }],
  },
  markerDisc: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  /** A downward triangle tucked under the disc, pointing at the chosen spot. */
  markerNeedle: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: MARKER_NEEDLE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: color.brand,
  },
});

/** Composes a short human-readable area label; null when the platform yields nothing usable. */
function formatAreaLabel(place: Location.LocationGeocodedAddress): string | null {
  const line = [
    place.street,
    place.subregion ?? place.district,
    place.city ?? place.region,
    place.postalCode,
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return line ? line.slice(0, 120) : null;
}

/**
 * "Where do you live?", asked on a full-screen map.
 *
 * The map is the screen, like a maps app: the customer can zoom out, see their
 * street, a landmark, the park at the corner, and recognise home from the
 * surroundings rather than trusting an address string. The question and the
 * actions float over it, so nothing pushes the map into a small window.
 */
export default function OnboardingAddress() {
  const insets = useSafeAreaInsets();
  const { data: profile } = useCustomerProfile();
  const save = useSaveOnboardingStep();

  const [coords, setCoords] = useSeededState<Coordinates | null>(
    profile?.latitude != null && profile.longitude != null
      ? { latitude: profile.latitude, longitude: profile.longitude }
      : null,
    null,
  );
  const [label, setLabel] = useState<string | null>(profile?.locationLabel ?? null);
  /** idle: settled · moving: pan in flight · resolving: geocoder working */
  const [phase, setPhase] = useState<'idle' | 'moving' | 'resolving'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  /** Shown only after the customer grants permission, so the map never prompts on its own. */
  const [showsUserLocation, setShowsUserLocation] = useState(false);
  /** The floating panel's height, so the pin can sit in the map it leaves clear. */
  const [panelHeight, setPanelHeight] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  const cameraRef = useRef<MapView | null>(null);
  // Guards against stale reverse-geocode results landing after a newer pan.
  const lookupIdRef = useRef(0);
  // The seeded coordinate is framed once; later pans must not yank the camera.
  const framedRef = useRef(false);

  const resolveLabel = useCallback(async (point: Coordinates) => {
    const lookupId = ++lookupIdRef.current;
    try {
      const [place] = await Location.reverseGeocodeAsync(point);
      if (lookupId !== lookupIdRef.current) return;
      setLabel(place ? formatAreaLabel(place) : null);
    } catch {
      if (lookupId === lookupIdRef.current) setLabel(null);
    }
  }, []);

  /**
   * The pin is drawn above the map's own centre, because the floating panel
   * covers the bottom of the screen. This is the share of the map's height
   * between the centre and the pin, in degrees of latitude.
   */
  const pinOffset = useCallback(
    (latitudeDelta: number) => (mapHeight > 0 ? (panelHeight / 2 / mapHeight) * latitudeDelta : 0),
    [mapHeight, panelHeight],
  );

  /** The coordinate under the pin for a settled camera. */
  const pinCoordinate = useCallback(
    (region: Region): Coordinates => ({
      latitude: region.latitude + pinOffset(region.latitudeDelta),
      longitude: region.longitude,
    }),
    [pinOffset],
  );

  /** Puts `point` under the pin, at `zoom`, without moving the pin itself. */
  const focusOn = useCallback(
    (point: Coordinates, zoom: number, animated: boolean) => {
      const camera = cameraRef.current;
      if (!camera || mapHeight <= 0) return;

      const region = regionFor([point.longitude, point.latitude], zoom);
      camera.animateToRegion(
        { ...region, latitude: point.latitude - pinOffset(region.latitudeDelta) },
        animated ? 600 : 0,
      );
    },
    [mapHeight, pinOffset],
  );

  function settleAt(point: Coordinates) {
    setCoords(point);
    setPhase('resolving');
    void resolveLabel(point).then(() => {
      setPhase((current) => (current === 'resolving' ? 'idle' : current));
    });
  }

  // Fires once the camera comes to rest, whether from a gesture or a
  // programmatic move (locate-me). Either way the spot under the pin is the
  // pick. The first frames arrive before the panel is measured, and the framing
  // pass below settles those properly.
  function onRegionChangeComplete(region: Region) {
    if (panelHeight <= 0) return;
    settleAt(pinCoordinate(region));
  }

  // If the customer already allowed location (e.g. the app's live-location
  // sync), show the blue dot straight away. A plain read never prompts.
  useEffect(() => {
    let active = true;
    void Location.getForegroundPermissionsAsync().then(({ granted }) => {
      if (active && granted) setShowsUserLocation(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Frame the location the customer already had once the layout is known, so
  // they open on their street rather than next to it. Only the seeded profile
  // coordinate does this: later pans must not yank the camera back.
  const seedLat = profile?.latitude ?? null;
  const seedLng = profile?.longitude ?? null;

  useEffect(() => {
    if (framedRef.current || !mapReady || seedLat == null || seedLng == null) return;
    if (mapHeight <= 0 || panelHeight <= 0) return;

    framedRef.current = true;
    focusOn({ latitude: seedLat, longitude: seedLng }, STREET_ZOOM, false);
  }, [mapReady, seedLat, seedLng, mapHeight, panelHeight, focusOn]);

  /**
   * Asks for location only when the Customer taps the button.
   *
   * The permission is requested at the moment it is used and explained first,
   * rather than on app launch (CLAUDE.md "Location"). Declining is fine: the
   * pin can be placed by moving the map manually instead.
   */
  async function detectCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission declined — drag the map to your location instead.');
        return;
      }
      setShowsUserLocation(true);

      const position = await readPreciseLocation();
      if (!position) {
        setLocationError('Could not get a precise fix — drag the map to your exact spot instead.');
        return;
      }

      setCoords(position);
      setPhase('moving');
      focusOn(position, STREET_ZOOM, true);
    } catch {
      setLocationError('Could not read your location. You can still continue.');
    } finally {
      setIsLocating(false);
    }
  }

  async function onContinue() {
    if (coords) {
      try {
        await save.mutateAsync({
          coordinates: coords,
          locationLabel: label ?? undefined,
        });
      } catch {
        // The panel surfaces `save.isError`; a failed save must not advance.
        return;
      }
    }
    router.push('/onboarding/review');
  }

  const addressText =
    phase === 'moving'
      ? 'Release to set this spot'
      : phase === 'resolving'
        ? 'Finding address…'
        : (label ??
          (coords
            ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
            : 'Move the map to pick a spot'));

  return (
    <View className="flex-1 bg-surface-muted">
      <MapView
        ref={cameraRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(
          coords ? [coords.longitude, coords.latitude] : INITIAL_CENTER,
          coords ? STREET_ZOOM : CITY_ZOOM,
        )}
        onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
        onMapReady={() => setMapReady(true)}
        onRegionChange={() => setPhase('moving')}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={showsUserLocation}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        pitchEnabled={false}
        rotateEnabled={false}
      />

      {/* The pick. A home pin, deliberately not a blue dot: the device's own
          position is already the map's blue dot, and two blue dots read as two
          different places. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 items-center justify-center"
        style={{ top: 0, bottom: panelHeight }}
      >
        <View style={styles.marker}>
          <View
            className="items-center justify-center rounded-full border-[3px] border-surface bg-brand"
            style={[{ width: MARKER_SIZE, height: MARKER_SIZE }, styles.markerDisc]}
          >
            <Ionicons name="home" size={20} color={color['brand-contrast']} />
          </View>
          <View style={styles.markerNeedle} />
        </View>
      </View>

      {/* The question, floating over the map. */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0 px-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View
          className="rounded-2xl border border-border bg-surface px-4 pb-4 pt-3"
          style={elevation.md}
        >
          <StepProgress step="address" />
          <Text variant="title" className="mt-3">
            Where do you live?
          </Text>
          <Text variant="footnote" className="mt-1">
            Drag the map so the pin sits on your home.
          </Text>
        </View>
      </View>

      {/* The address and the actions, floating over the map's lower edge. */}
      <View
        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface px-5 pt-4"
        style={[{ paddingBottom: insets.bottom + 16 }, elevation.lg]}
        onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}
      >
        <Text variant="label">Your location</Text>
        <Text
          variant="body"
          className="mt-1"
          numberOfLines={2}
          style={{ minHeight: ADDRESS_LINE_HEIGHT }}
        >
          {addressText}
        </Text>

        {locationError ? (
          <Text variant="footnote" className="text-warning">
            {locationError}
          </Text>
        ) : null}

        <Button
          label="Use my current location"
          variant="secondary"
          className="mt-3"
          leading={<Ionicons name="locate" size={18} color={color.brand} />}
          loading={isLocating}
          onPress={() => void detectCurrentLocation()}
        />
        <Button
          label="Continue"
          size="lg"
          className="mt-2.5"
          loading={save.isPending}
          onPress={() => void onContinue()}
        />

        {save.isError ? (
          <Text variant="footnote" className="mt-2 text-center text-danger">
            Could not save your location. Please try again.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

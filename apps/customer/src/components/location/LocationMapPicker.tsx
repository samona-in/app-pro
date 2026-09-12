import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Camera,
  Map as MapLibreMap,
  type CameraRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AddressSuggestion } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PickedLocation {
  latitude: number;
  longitude: number;
  label: string | null;
  /** Structured place resolved for the spot; null when unavailable. */
  place?: AddressSuggestion | null;
}

export type ResolveAddressFn = (point: Coordinates) => Promise<AddressSuggestion | null>;

export interface LocationMapPickerProps {
  /** Anchor the camera is centred on when the map first mounts. */
  value?: Coordinates | null;
  /// Reports the settled selection (coords and a described place).
  onChange?: (picked: PickedLocation) => void;
  /**
   * Replaces the built-in (Apple/Google-backed) reverse geocoder.
   *
   * The new address flow must stay OSM-only, so it injects a resolver that
   * calls our server proxy instead. When absent, the picker falls back to the
   * platform geocoder for the legacy onboarding screen.
   */
  resolveAddress?: ResolveAddressFn;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Free OpenFreeMap tiles rendered by the keyless MapLibre engine. */
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const DEFAULT_CENTER: [number, number] = [77.209, 28.6139]; // [lng, lat] — India-first default
const DEFAULT_ZOOM = 12.5;

/** Composes a short human-readable area label; null when nothing is usable. */
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

/** Lifts a platform geocode result up to the provider-agnostic suggestion shape. */
function suggestionFromDevicePlace(
  place: Location.LocationGeocodedAddress,
  coordinates: Coordinates,
): AddressSuggestion {
  return {
    formattedAddress: formatAreaLabel(place) ?? coordinatesToLabel(coordinates),
    mainLabel: place.name ?? place.street ?? place.district ?? place.city ?? '',
    secondary: [place.street, place.city ?? place.region, place.postalCode]
      .filter((part): part is string => Boolean(part))
      .join(', ') || null,
    locality: place.subregion ?? place.district ?? null,
    city: place.city ?? null,
    state: place.region ?? null,
    postalCode: place.postalCode ?? null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

function coordinatesToLabel(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

/**
 * Reusable full-size map for picking a location, like a maps app.
 *
 * Renders a keyless MapLibre map with a fixed centre pin, resolves a readable
 * area label for the settled spot, and offers a "locate me" control that moves
 * the map to the device's current location. It is semi-controlled: `value`
 * seeds the initial camera, and every settle (pan or locate) reports the new
 * selection through `onChange` so the owner can persist it.
 */
export function LocationMapPicker({
  value,
  onChange,
  resolveAddress,
  className,
  style,
}: LocationMapPickerProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef | null>(null);
  const lookupIdRef = useRef(0);

  const [phase, setPhase] = useState<'idle' | 'moving' | 'resolving'>('idle');
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const resolveLabel = useCallback(
    async (point: Coordinates) => {
      const lookupId = ++lookupIdRef.current;
      if (resolveAddress) {
        try {
          const place = await resolveAddress(point);
          return lookupId === lookupIdRef.current ? place : null;
        } catch {
          return null;
        }
      }
      try {
        const [place] = await Location.reverseGeocodeAsync(point);
        if (lookupId === lookupIdRef.current) {
          return place ? suggestionFromDevicePlace(place, point) : null;
        }
      } catch {
        /* keep null when reverse geocoding fails */
      }
      return null;
    },
    [resolveAddress],
  );

  function settleAt(lngLat: [number, number]) {
    const point = { latitude: lngLat[1], longitude: lngLat[0] };
    setPhase('resolving');
    void resolveLabel(point).then((place) => {
      onChange?.({
        ...point,
        label: place?.formattedAddress ?? null,
        place: place ?? null,
      });
      setPhase((current) => (current === 'resolving' ? 'idle' : current));
    });
  }

  function onRegionDidChange(event: NativeSyntheticEvent<ViewStateChangeEvent>) {
    const { center, userInteraction } = event.nativeEvent;
    if (userInteraction || phase !== 'moving') {
      settleAt(center as [number, number]);
    }
  }

  /**
   * Asks for location only when the user taps "locate me".
   *
   * Permission is requested at the moment it is used and explained first,
   * rather than on screen entry (CLAUDE.md "Location"). Declining is fine —
   * the pin can still be placed by moving the map manually.
   */
  async function locateMe() {
    setIsLocating(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission declined — drag the map to your location instead.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setPhase('moving');
      cameraRef.current?.easeTo({
        center: [point.longitude, point.latitude],
        zoom: DEFAULT_ZOOM + 1.5,
        duration: 600,
      });
    } catch {
      setLocationError('Could not read your location. You can still continue.');
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <View className={cn('relative overflow-hidden', className)} style={style}>
      <MapLibreMap
        mapStyle={MAP_STYLE_URL}
        style={{ flex: 1 }}
        onRegionIsChanging={() => setPhase('moving')}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: value ? [value.longitude, value.latitude] : DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
          }}
        />
      </MapLibreMap>

      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View
          className="h-5 w-5 rounded-full border-[3px] border-surface bg-brand"
          style={{
            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          }}
        />
      </View>

      {/* Locate me (Google-Maps style) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Use my current location"
        onPress={() => void locateMe()}
        className="absolute bottom-4 right-4 h-12 w-12 items-center justify-center rounded-full bg-surface active:opacity-80"
        style={{
          elevation: 4,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        {isLocating ? (
          <ActivityIndicator size="small" color={color.brand} />
        ) : (
          <Ionicons name="locate" size={22} color={color.brand} />
        )}
      </Pressable>

      {locationError ? (
        <View className="mx-4 rounded-lg bg-surface px-3 py-2" style={{ top: insets.top + 12 }}>
          <Text variant="caption" className="text-warning">
            {locationError}
          </Text>
        </View>
      ) : null}

      {phase !== 'idle' ? (
        <View pointerEvents="none" className="absolute inset-x-0 top-4 items-center">
          <View className="rounded-full bg-surface px-3 py-1.5">
            <Text variant="caption" className="text-text-secondary">
              {phase === 'moving' ? 'Release to set this spot' : 'Finding address…'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import MapView, { PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Button, Text } from '@/components/ui';
import { useCustomerProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';
import { regionFor } from '@/utils/map';

interface Coordinates {
  latitude: number;
  longitude: number;
}

const INITIAL_CENTER: [number, number] = [77.209, 28.6139]; // [lng, lat] — India-first default
const INITIAL_ZOOM = 12.5;

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

export default function OnboardingAddress() {
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

  const cameraRef = useRef<MapView | null>(null);
  // Guards against stale reverse-geocode results landing after a newer pan.
  const lookupIdRef = useRef(0);

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

  function settleAt(lngLat: [number, number]) {
    const point = { latitude: lngLat[1], longitude: lngLat[0] };
    setCoords(point);
    setPhase('resolving');
    void resolveLabel(point).then(() => {
      setPhase((current) => (current === 'resolving' ? 'idle' : current));
    });
  }

  // Fires once the camera comes to rest, whether from a gesture or a
  // programmatic move (locate-me). Either way the settled centre is the pick.
  function onRegionChangeComplete(region: Region) {
    settleAt([region.longitude, region.latitude]);
  }

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

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCoords(point);
      setPhase('moving');
      cameraRef.current?.animateToRegion(
        regionFor([point.longitude, point.latitude], INITIAL_ZOOM + 1.5),
        600,
      );
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
        // The layout surfaces `save.isError`; a failed save must not advance.
        return;
      }
    }
    router.push('/onboarding/review');
  }

  return (
    <OnboardingStepLayout
      step="address"
      title="Where do you live?"
      subtitle="Drag the map so the pin sits on your location, or use your current location."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? 'Could not save your location. Please try again.' : null}
    >
      <View className="overflow-hidden rounded-2xl border border-border">
        <View className="relative">
          <MapView
            provider={PROVIDER_DEFAULT}
            style={{ height: 264 }}
            initialRegion={regionFor(
              coords ? [coords.longitude, coords.latitude] : INITIAL_CENTER,
              INITIAL_ZOOM,
            )}
            onRegionChange={() => setPhase('moving')}
            onRegionChangeComplete={onRegionChangeComplete}
          />
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View
              className="h-5 w-5 rounded-full border-[3px] border-surface bg-brand"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 6,
              }}
            />
          </View>
        </View>

        <View className="border-t border-border bg-surface px-4 py-3">
          <Text variant="footnote" className="text-text-secondary">
            Your location
          </Text>
          <Text variant="body" className="mt-0.5" numberOfLines={2}>
            {phase === 'moving'
              ? 'Release to set this spot'
              : phase === 'resolving'
                ? 'Finding address…'
                : (label ??
                  (coords
                    ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                    : 'Move the map to pick a spot'))}
          </Text>
        </View>
      </View>

      <Button
        label="Use my current location"
        variant="secondary"
        loading={isLocating}
        className="mt-4"
        onPress={() => void detectCurrentLocation()}
      />
      {locationError ? (
        <Text variant="footnote" className="mt-2 text-warning">
          {locationError}
        </Text>
      ) : null}
    </OnboardingStepLayout>
  );
}

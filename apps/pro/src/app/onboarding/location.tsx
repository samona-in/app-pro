import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Button, Input, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

interface Coordinates {
  latitude: number;
  longitude: number;
}

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
 * Service-area onboarding step.
 *
 * Uses the native map in a development build; in Expo Go, which does not bundle
 * the MapLibre native module, the area is picked from the device location or
 * typed in by hand. Coordinates only go to the server when a location was
 * actually read.
 */
export default function OnboardingLocation() {
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();

  const [coords, setCoords] = useSeededState<Coordinates | null>(
    profile?.latitude != null && profile.longitude != null
      ? { latitude: profile.latitude, longitude: profile.longitude }
      : null,
    null,
  );
  const [label, setLabel] = useSeededState<string | null>(profile?.locationLabel, '');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  /**
   * Asks for location only when the Pro taps the button.
   *
   * The permission is requested at the moment it is used and explained first,
   * rather than on app launch (CLAUDE.md "Location"). Declining is fine: the
   * work area can be typed in instead.
   */
  async function detectCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission declined — type your work area instead.');
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

      try {
        const [place] = await Location.reverseGeocodeAsync(point);
        if (place) setLabel(formatAreaLabel(place));
      } catch {
        // Reverse geocoding is best-effort; coordinates are still saved and the
        // label can be typed in by hand.
      }
    } catch {
      setLocationError('Could not read your location. You can still continue.');
    } finally {
      setIsLocating(false);
    }
  }

  async function onContinue() {
    // Coordinates are optional, so there may be nothing to persist here.
    if (coords) {
      await save.mutateAsync({ coordinates: coords, locationLabel: label ?? undefined });
    }
    router.push('/onboarding/radius');
  }

  return (
    <OnboardingStepLayout
      step="location"
      title="Where do you work?"
      subtitle="Use your current location, or type the area you work in."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? 'Could not save your location. Please try again.' : null}
    >
      <View className="overflow-hidden rounded-2xl border border-border">
        <View className="gap-1 bg-background px-4 py-3">
          <Text variant="footnote" className="text-text-secondary">
            Service area
          </Text>
          <Text variant="body" className="mt-0.5" numberOfLines={2}>
            {isLocating
              ? 'Finding your location…'
              : label?.trim() ||
                (coords
                  ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                  : 'No area set yet')}
          </Text>
        </View>

        <View className="border-t border-border bg-background px-4 py-3">
          <Input
            label="Work area"
            value={label ?? ''}
            onChangeText={setLabel}
            placeholder="e.g. Koramangala, Bengaluru"
            autoComplete="street-address"
            autoCapitalize="words"
            editable={!save.isPending}
          />
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

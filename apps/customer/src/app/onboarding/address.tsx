import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Button, Input, Text } from '@/components/ui';
import { useCustomerProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

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
 * Address onboarding step.
 *
 * Picks the area on the map in a development build; in Expo Go, which does not
 * bundle the MapLibre native module, the pin is placed from the device location
 * or typed in by hand. Address is optional: coordinates only go to the server
 * when a location was actually read.
 */
export default function OnboardingAddress() {
  const { data: profile } = useCustomerProfile();
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
   * Asks for location only when the Customer taps the button.
   *
   * The permission is requested at the moment it is used and explained first,
   * rather than on app launch (CLAUDE.md "Location"). Declining is fine: the
   * address can be typed in instead.
   */
  async function detectCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission declined — type your address above instead.');
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
      setLocationError('Could not read your location. You can type your address instead.');
    } finally {
      setIsLocating(false);
    }
  }

  const locationCounts = coords !== null || (label?.trim()?.length ?? 0) >= 2;

  async function onContinue() {
    await save.mutateAsync({
      coordinates: coords ?? undefined,
      locationLabel: label?.trim() ? label.trim() : undefined,
    });
    router.push('/onboarding/review');
  }

  return (
    <OnboardingStepLayout
      step="address"
      title="Where do you live?"
      subtitle="Use your current location, or type the area you're usually in."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={!locationCounts}
      error={save.isError ? 'Could not save your address. Please try again.' : null}
    >
      <View className="overflow-hidden rounded-2xl border border-border">
        <View className="gap-1 bg-background px-4 py-3">
          <Text variant="footnote" className="text-text-secondary">
            Your address
          </Text>
          <Text variant="body" className="mt-0.5" numberOfLines={2}>
            {isLocating
              ? 'Finding your location…'
              : label?.trim() ||
                (coords
                  ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                  : 'No address set yet')}
          </Text>
        </View>

        <View className="border-t border-border bg-background px-4 py-3">
          <Input
            label="Address or area"
            value={label ?? ''}
            onChangeText={setLabel}
            placeholder="e.g. MG Road, Hyderabad"
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

      <Text variant="caption" className="mt-4">
        Professionals see your area when they accept your request.
      </Text>
    </OnboardingStepLayout>
  );
}

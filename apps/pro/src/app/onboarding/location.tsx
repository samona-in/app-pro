import { useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Button, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingLocation() {
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();

  const [coords, setCoords] = useSeededState<{ latitude: number; longitude: number } | null>(
    profile?.latitude != null && profile.longitude != null
      ? { latitude: profile.latitude, longitude: profile.longitude }
      : null,
    null,
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  /**
   * Asks for location only when the Pro taps the button.
   *
   * The permission is requested at the moment it is used and explained first,
   * rather than on app launch (CLAUDE.md "Location"). Declining is fine: the
   * radius on the next step is enough to finish onboarding.
   */
  async function detectCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission was declined. You can still continue.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      setLocationError('Could not read your location. You can still continue.');
    } finally {
      setIsLocating(false);
    }
  }

  async function onContinue() {
    // Coordinates are optional, so there may be nothing to persist here.
    if (coords) {
      await save.mutateAsync({ coordinates: coords });
    }
    router.push('/onboarding/radius');
  }

  return (
    <OnboardingStepLayout
      step="location"
      title="Where do you work?"
      subtitle="We use this to send you jobs nearby. Only you see your exact location."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? 'Could not save your location. Please try again.' : null}
    >
      <Button
        label={coords ? 'Location set' : 'Use my current location'}
        variant="secondary"
        loading={isLocating}
        leading={undefined}
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

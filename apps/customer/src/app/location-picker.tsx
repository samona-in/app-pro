import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Button, Screen, Text } from '@/components/ui';
import { LocationMapPicker, type PickedLocation } from '@/components/location';
import { useSaveOnboardingStep, useSession } from '@/hooks';
import { color } from '@/theme';

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Full-screen location picker reached from the home header.
 *
 * A Google-Maps-style picker: drag the map to place the pin, or tap "locate me"
 * on the map to jump to the device's current location. Choosing an address
 * persists it to the customer profile and returns to the previous screen, so
 * the home header reflects the new location immediately.
 */
export default function LocationPicker() {
  const { customerProfile } = useSession();
  const save = useSaveOnboardingStep();

  const [coords, setCoords] = useState<Coordinates | null>(
    customerProfile?.latitude != null && customerProfile.longitude != null
      ? { latitude: customerProfile.latitude, longitude: customerProfile.longitude }
      : null,
  );
  const [label, setLabel] = useState<string | null>(customerProfile?.locationLabel ?? null);

  function handleChange(picked: PickedLocation) {
    setCoords({ latitude: picked.latitude, longitude: picked.longitude });
    setLabel(picked.label);
  }

  async function onUseThisLocation() {
    if (!coords) return;
    await save.mutateAsync({ coordinates: coords, locationLabel: label ?? undefined });
    router.back();
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Set location',
          headerTintColor: color['text-primary'],
          headerStyle: { backgroundColor: color.surface },
        }}
      />
      <Screen scrollable={false} padded={false} edges={['bottom']}>
        <View className="flex-1">
          <LocationMapPicker
            value={coords}
            onChange={handleChange}
            className="flex-1"
          />

          <View className="border-t border-border bg-surface px-5 pb-5 pt-3">
            <Text variant="footnote" className="text-text-secondary">
              Selected location
            </Text>
            <Text variant="body" className="mt-0.5" numberOfLines={2}>
              {label ?? (coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Move the map to pick a spot')}
            </Text>

            <Button
              label="Use this location"
              loading={save.isPending}
              className="mt-4"
              onPress={() => void onUseThisLocation()}
            />
          </View>
        </View>
      </Screen>
    </>
  );
}

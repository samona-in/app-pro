import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, Stack } from 'expo-router';
import type { AddressLabel, AddressSuggestion, SelectedAddress } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LocationMapPicker,
  type PickedLocation,
  type ResolveAddressFn,
} from '@/components/location';
import { Button, Text } from '@/components/ui';
import {
  useCreateSavedAddress,
  useSaveOnboardingStep,
} from '@/hooks';
import { geocodingApi } from '@/services/geocoding';
import { useAddressStore } from '@/stores/addresses';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import {
  ADDRESS_LABEL_NAMES,
  fallbackLocationLabel,
  selectedToSuggestion,
  suggestionToSelected,
} from '@/utils/address';

/** The three "Save as" choices; Home starts selected. */
const LABEL_CHOICES: AddressLabel[] = ['HOME', 'WORK', 'OTHER'];

/**
 * Confirms the address the customer just searched for.
 *
 * The map is pre-anchored on the chosen spot; dragging it settles on a new one,
 * which is reverse-geocoded back through the server proxy. Confirming always
 * records the address — it becomes the profile's active location, is remembered
 * on-device as a recent, and is saved to the customer's saved list under the
 * chosen label.
 */
export default function AddressConfirm() {
  const insets = useSafeAreaInsets();
  const pending = useAddressStore((state) => state.pending);
  const addRecent = useAddressStore((state) => state.addRecent);
  const save = useSaveOnboardingStep();
  const createSaved = useCreateSavedAddress();

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    pending ? { latitude: pending.latitude, longitude: pending.longitude } : null,
  );
  const [place, setPlace] = useState<AddressSuggestion | null>(
    pending ? selectedToSuggestion(pending) : null,
  );
  const [label, setLabel] = useState<AddressLabel>('HOME');
  const [error, setError] = useState<string | null>(null);

  const resolveAddress: ResolveAddressFn = useCallback(async (point) => {
    try {
      return await geocodingApi.reverse(point.latitude, point.longitude);
    } catch {
      return null;
    }
  }, []);

  function handleChange(picked: PickedLocation) {
    setCoords({ latitude: picked.latitude, longitude: picked.longitude });
    setPlace(picked.place ?? null);
  }

  const busy = save.isPending || createSaved.isPending;
  const displayedLabel = place?.formattedAddress ??
    (coords ? fallbackLocationLabel(coords.latitude, coords.longitude) : '');

  async function onConfirm() {
    if (!coords || busy) return;
    setError(null);

    const suggestion: AddressSuggestion = place ?? {
      formattedAddress: fallbackLocationLabel(coords.latitude, coords.longitude),
      mainLabel: fallbackLocationLabel(coords.latitude, coords.longitude),
      secondary: null,
      locality: null,
      city: null,
      state: null,
      postalCode: null,
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
    const selected: SelectedAddress = suggestionToSelected(suggestion);

    try {
      await save.mutateAsync({
        coordinates: { latitude: selected.latitude, longitude: selected.longitude },
        locationLabel: selected.formattedAddress,
      });
      addRecent(selected);

      try {
        await createSaved.mutateAsync({
          label,
          addressLine1: selected.formattedAddress,
          addressLine2: undefined,
          landmark: undefined,
          locality: selected.locality ?? undefined,
          city: selected.city ?? undefined,
          state: selected.state ?? undefined,
          postalCode: selected.postalCode ?? undefined,
          coordinates: { latitude: selected.latitude, longitude: selected.longitude },
        });
      } catch {
        Alert.alert(
          'Location set',
          'We could not add this address to your saved list, but it is now your location.',
        );
      }

      router.dismissAll();
    } catch {
      setError('Could not update your location. Please try again.');
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Confirm address',
          headerTintColor: color['text-primary'],
          headerStyle: { backgroundColor: color.surface },
        }}
      />

      {!pending ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="body" className="text-center text-text-secondary">
            Nothing to confirm yet.
          </Text>
          <Button
            label="Choose an address"
            className="mt-5"
            onPress={() => router.back()}
          />
        </View>
      ) : (
        <View className="flex-1">
          <View className="flex-1">
            <LocationMapPicker
              value={coords}
              onChange={handleChange}
              resolveAddress={resolveAddress}
              className="flex-1"
            />
          </View>

          <View
            className="border-t border-border bg-surface px-5 pt-4"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Text variant="footnote" className="text-text-secondary">
              Selected address
            </Text>
            <Text variant="bodyLg" numberOfLines={2} className="mt-1">
              {displayedLabel}
            </Text>

            <Text variant="label" className="mb-2 mt-4">
              Save as
            </Text>
            <View className="flex-row gap-2">
              {LABEL_CHOICES.map((choice) => {
                const selected = label === choice;
                return (
                  <Pressable
                    key={choice}
                    accessibilityRole="button"
                    accessibilityLabel={`Save as ${ADDRESS_LABEL_NAMES[choice]}`}
                    accessibilityState={{ selected }}
                    onPress={() => setLabel(choice)}
                    className={cn(
                      'min-h-[44px] flex-1 items-center justify-center rounded-full border',
                      selected
                        ? 'border-brand bg-brand'
                        : 'border-border bg-background',
                    )}
                  >
                    <Text
                      variant="body"
                      className={cn(
                        'font-semibold',
                        selected ? 'text-white' : 'text-text-secondary',
                      )}
                    >
                      {ADDRESS_LABEL_NAMES[choice]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <Text variant="caption" className="mt-2 text-danger">
                {error}
              </Text>
            ) : null}

            <Button
              label="Confirm address"
              loading={busy}
              className="mt-4"
              onPress={() => void onConfirm()}
            />
          </View>
        </View>
      )}
    </>
  );
}
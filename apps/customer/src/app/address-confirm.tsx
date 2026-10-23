import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import type { AddressLabel, AddressSuggestion, SelectedAddress } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LocationMapPicker,
  type PickedLocation,
  type ResolveAddressFn,
} from '@/components/location';
import { SaveAsLabelPicker } from '@/components/address/SaveAsLabelPicker';
import { Button, Input, Text } from '@/components/ui';
import {
  useCreateSavedAddress,
  useSaveOnboardingStep,
} from '@/hooks';
import { geocodingApi } from '@/services/geocoding';
import { useAddressStore } from '@/stores/addresses';
import { color } from '@/theme';
import {
  fallbackLocationLabel,
  selectedToSuggestion,
  suggestionToSelected,
} from '@/utils/address';

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
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
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
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

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

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Please add a name for this address.');
      return;
    }
    setNameError(null);

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
      placeId: null,
    };
    const selected: SelectedAddress = suggestionToSelected(suggestion);

    try {
      await save.mutateAsync({
        coordinates: { latitude: selected.latitude, longitude: selected.longitude },
        locationLabel: selected.formattedAddress,
        locationPlaceId: selected.placeId,
      });

      // Navigate before any state updates so Android does not try to mutate
      // native views (including the map) while they are being torn down.
      router.dismissAll();
      addRecent(selected);

      // Best-effort: save to the address book. The location is already set above,
      // so a failure here is silent — the user can add the address manually later.
      createSaved.mutateAsync({
        name: trimmedName,
        label,
        addressLine1: selected.formattedAddress,
        addressLine2: undefined,
        landmark: undefined,
        locality: selected.locality ?? undefined,
        city: selected.city ?? undefined,
        state: selected.state ?? undefined,
        postalCode: selected.postalCode ?? undefined,
        coordinates: { latitude: selected.latitude, longitude: selected.longitude },
        placeId: selected.placeId,
      }).catch(() => {});
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

      {/* Padding behaviour shrinks the map and the form area as the keyboard
          rises. The Confirm button sits in its own footer, so it always stays
          just above the keyboard instead of being pushed behind it.
          `automaticOffset` accounts for the native header above this screen. */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
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

            <View className="border-t border-border bg-surface pt-4">
              {/* A plain ScrollView: the keyboard is handled by the
                  KeyboardAvoidingView above, so the form only needs to shrink
                  and scroll when space runs out. A KeyboardAwareScrollView
                  would add its own keyboard padding here, leaving a large
                  empty gap between the Save-as chips and the footer button. */}
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text variant="footnote" className="text-text-secondary">
                  Selected address
                </Text>
                <Text variant="bodyLg" numberOfLines={2} className="mt-1">
                  {displayedLabel}
                </Text>

                <Text variant="label" className="mb-2 mt-4">
                  Name
                </Text>
                <Input
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (nameError) setNameError(null);
                  }}
                  error={nameError ?? undefined}
                  placeholder="e.g. Mum's house"
                  autoCapitalize="words"
                  accessibilityLabel="Saved address name"
                />

                <Text variant="label" className="mb-2 mt-4">
                  Save as
                </Text>
                <SaveAsLabelPicker value={label} onChange={setLabel} />

                {error ? (
                  <Text variant="caption" className="mt-2 text-danger">
                    {error}
                  </Text>
                ) : null}
              </ScrollView>

              <View
                className="px-5 pt-2"
                style={{ paddingBottom: keyboardVisible ? 12 : insets.bottom + 16 }}
              >
                <Button
                  label="Confirm address"
                  loading={busy}
                  onPress={() => void onConfirm()}
                />
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}
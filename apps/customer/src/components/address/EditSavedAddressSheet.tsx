import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AddressLabel, AddressSuggestion, SavedAddress } from '@samona/types';
import {
  LocationMapPicker,
  type PickedLocation,
  type ResolveAddressFn,
} from '@/components/location';
import { Button, Input, Text } from '@/components/ui';
import { useUpdateSavedAddress } from '@/hooks';
import { geocodingApi } from '@/services/geocoding';
import { color } from '@/theme';
import { fallbackLocationLabel, savedAddressToSuggestion } from '@/utils/address';
import { SaveAsLabelPicker } from './SaveAsLabelPicker';

interface EditSavedAddressSheetProps {
  address: SavedAddress;
  onClose: () => void;
}

/**
 * Edits one saved address in a sheet: a map up top (drag to move the pin),
 * the address line, the customer's own name and the Home/Work/Other label in
 * the body, and an "Update address" button pinned to the footer.
 *
 * Mounted only while an address is being edited, so it animates and seeds its
 * state fresh from `address` on every open.
 */
export function EditSavedAddressSheet({
  address,
  onClose,
}: EditSavedAddressSheetProps) {
  const insets = useSafeAreaInsets();
  const updateSaved = useUpdateSavedAddress();

  const [coords, setCoords] = useState({
    latitude: address.latitude,
    longitude: address.longitude,
  });
  const [place, setPlace] = useState<AddressSuggestion | null>(
    savedAddressToSuggestion(address),
  );
  const [name, setName] = useState(address.name);
  const [label, setLabel] = useState<AddressLabel>(address.label);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const snapPoints = useMemo(() => ['92%'], []);

  const resolveAddress: ResolveAddressFn = useCallback(async (point) => {
    try {
      return await geocodingApi.reverse(point.latitude, point.longitude);
    } catch {
      return null;
    }
  }, []);

  const handleChange = useCallback((picked: PickedLocation) => {
    setCoords({ latitude: picked.latitude, longitude: picked.longitude });
    setPlace(picked.place ?? null);
  }, []);

  const handleClose = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const displayedAddress =
    place?.formattedAddress ??
    fallbackLocationLabel(coords.latitude, coords.longitude);

  async function handleUpdate() {
    if (updateSaved.isPending) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Please add a name for this address.');
      return;
    }
    setNameError(null);

    const suggestion: AddressSuggestion = place ?? {
      formattedAddress: displayedAddress,
      mainLabel: displayedAddress,
      secondary: null,
      locality: null,
      city: null,
      state: null,
      postalCode: null,
      latitude: coords.latitude,
      longitude: coords.longitude,
    };

    try {
      await updateSaved.mutateAsync({
        id: address.id,
        input: {
          name: trimmedName,
          label,
          addressLine1: suggestion.formattedAddress,
          addressLine2: address.addressLine2 ?? undefined,
          landmark: address.landmark ?? undefined,
          locality: suggestion.locality ?? undefined,
          city: suggestion.city ?? undefined,
          state: suggestion.state ?? undefined,
          postalCode: suggestion.postalCode ?? undefined,
          coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        },
      });
      onClose();
    } catch {
      setError('Could not update this address. Please try again.');
    }
  }

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enableContentPanningGesture={false}
      enablePanDownToClose
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
          pressBehavior="close"
        />
      )}
      onChange={handleClose}
      backgroundStyle={{ backgroundColor: color.surface }}
      handleIndicatorStyle={{ backgroundColor: color['border-strong'] }}
    >
      <BottomSheetView className="flex-1">
        <View className="h-48 overflow-hidden">
          <LocationMapPicker
            value={coords}
            onChange={handleChange}
            resolveAddress={resolveAddress}
            className="h-full"
          />
        </View>

        <BottomSheetScrollView
          contentContainerClassName="px-5 pt-4"
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
        >
          <Text variant="footnote" className="text-text-secondary">
            Selected address
          </Text>
          <Text variant="bodyLg" numberOfLines={2} className="mt-1">
            {displayedAddress}
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
        </BottomSheetScrollView>

        <View
          className="border-t border-border bg-surface px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Button
            label="Update address"
            loading={updateSaved.isPending}
            onPress={() => void handleUpdate()}
          />
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
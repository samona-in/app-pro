import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AddressLabel, AddressSuggestion, SavedAddress } from '@samona/types';
import {
  LocationMapPicker,
  type MapFocusRequest,
  type PickedLocation,
  type ResolveAddressFn,
} from '@/components/location';
import { Button, Divider, IconButton, Input, Text } from '@/components/ui';
import { useUpdateSavedAddress } from '@/hooks';
import { geocodingApi } from '@/services/geocoding';
import { color, elevation } from '@/theme';
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
export function EditSavedAddressSheet({ address, onClose }: EditSavedAddressSheetProps) {
  const insets = useSafeAreaInsets();
  const updateSaved = useUpdateSavedAddress();

  const [coords, setCoords] = useState({
    latitude: address.latitude,
    longitude: address.longitude,
  });
  const [place, setPlace] = useState<AddressSuggestion | null>(savedAddressToSuggestion(address));
  const [name, setName] = useState(address.name);
  const [label, setLabel] = useState<AddressLabel>(address.label);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocusRequest | null>(null);

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

  /**
   * "Change" re-focuses the map on the current pin so the customer can fine
   * tune the spot — dragging the map is what actually moves the pin.
   */
  const handleChangePress = useCallback(() => {
    setMapFocus({
      nonce: Date.now(),
      center: [coords.longitude, coords.latitude],
    });
  }, [coords.longitude, coords.latitude]);

  const locality = place?.mainLabel ?? fallbackLocationLabel(coords.latitude, coords.longitude);

  const displayedAddress =
    place?.formattedAddress ?? fallbackLocationLabel(coords.latitude, coords.longitude);

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
          opacity={0.65}
          pressBehavior="close"
        />
      )}
      onChange={handleClose}
      backgroundStyle={{ backgroundColor: color.surface }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
    >
      <BottomSheetView className="flex-1">
        <View className="h-[46%] shrink-0 overflow-hidden rounded-t-2xl">
          <LocationMapPicker
            value={coords}
            onChange={handleChange}
            resolveAddress={resolveAddress}
            centerPin="marker"
            focus={mapFocus}
            className="h-full"
          />

          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
            style={{ top: '58%' }}
          >
            <View className="rounded-full bg-surface-inverse px-3 py-1.5">
              <Text variant="caption" className="text-white">
                Place the pin accurately on map
              </Text>
            </View>
          </View>

          <View className="absolute right-4 top-4 z-10" style={elevation.md}>
            <IconButton
              name="close"
              accessibilityLabel="Close"
              variant="surface"
              onPress={onClose}
            />
          </View>
        </View>

        <View className="z-10 -mt-5 min-h-0 flex-1 rounded-t-2xl bg-surface" style={elevation.md}>
          <View className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-border-strong" />

          <View className="flex-row items-center justify-between gap-3 px-5 pt-4">
            <Text variant="bodyLg" numberOfLines={1} className="flex-1 font-semibold">
              {locality}
            </Text>
            <Button
              variant="outline"
              size="sm"
              fullWidth={false}
              label="Change"
              onPress={handleChangePress}
            />
          </View>

          <Text variant="footnote" numberOfLines={2} className="px-5 pt-1 text-text-muted">
            {displayedAddress}
          </Text>

          <Divider className="mt-4" />

          <KeyboardAwareScrollView
            className="min-h-0 flex-1"
            contentContainerClassName="px-5 py-4"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={16}
          >
            <Text variant="label" className="mb-2">
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
          </KeyboardAwareScrollView>

          <View
            className="shrink-0 border-t border-border bg-surface px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Button
              label="Update address"
              size="lg"
              loading={updateSaved.isPending}
              onPress={() => void handleUpdate()}
            />
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

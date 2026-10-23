import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import type { AddressSuggestion, SavedAddress, SelectedAddress } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddressListItem } from '@/components/address/AddressListItem';
import { SavedAddressListItem } from '@/components/address/SavedAddressListItem';
import { IconButton, Input, Text } from '@/components/ui';
import { useAddressSearch, useSaveOnboardingStep, useSavedAddresses } from '@/hooks';
import { geocodingApi } from '@/services/geocoding';
import { useAddressStore } from '@/stores/addresses';
import { color } from '@/theme';
import { fallbackLocationLabel, suggestionToSelected } from '@/utils/address';

/**
 * Address search, replacing the old map-only location picker on the home header.
 *
 * Search is Google end-to-end: free-text queries and reverse geocoding both run
 * through our server proxy (`/locations/*`), never a device or third-party
 * geocoder (CLAUDE.md "Location"). Picking a search result opens the map
 * confirm screen; tapping a saved or recent address applies it instantly.
 */
export default function AddressSearch() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locatingError, setLocatingError] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  const search = useAddressSearch(query);
  const { data: saved, isPending: savedPending } = useSavedAddresses();
  const save = useSaveOnboardingStep();
  const recents = useAddressStore((state) => state.recents);
  const setPending = useAddressStore((state) => state.setPending);
  const addRecent = useAddressStore((state) => state.addRecent);

  const trimmed = query.trim();
  const savedItems = (saved ?? []).slice(0, 4);

  function openConfirm(selected: SelectedAddress) {
    setPending(selected);
    router.push('/address-confirm');
  }

  /** Applies an already-known address to the profile and returns home. */
  async function applyAddress(selected: SelectedAddress) {
    setQuickError(null);
    try {
      await save.mutateAsync({
        coordinates: { latitude: selected.latitude, longitude: selected.longitude },
        locationLabel: selected.formattedAddress,
        locationPlaceId: selected.placeId,
      });
      // Navigate before state updates: calling addRecent first causes Android to
      // try inserting a view into a list that is simultaneously being unmounted
      // ("addViewAt: failed to insert view into parent at index N").
      router.back();
      addRecent(selected);
    } catch {
      setQuickError('Could not set your location. Please try again.');
    }
  }

  /**
   * Uses the device's last-known spot to seed the confirm screen.
   *
   * The permission is requested at the moment it is used, not on screen entry
   * (CLAUDE.md "Location"). Declining still leaves search and the map.
   */
  async function onUseCurrentLocation() {
    setLocating(true);
    setLocatingError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocatingError('Location permission declined — search for your address instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      const suggestion = await geocodingApi.reverse(latitude, longitude).catch(() => null);
      const selected: SelectedAddress = suggestion
        ? suggestionToSelected(suggestion)
        : {
            formattedAddress: fallbackLocationLabel(latitude, longitude),
            latitude,
            longitude,
            locality: null,
            city: null,
            state: null,
            postalCode: null,
            placeId: null,
          };
      openConfirm(selected);
    } catch {
      setLocatingError('Could not read your location. You can still search.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: color.surface, paddingTop: insets.top }}
    >
      <View className="flex-row items-center gap-1 px-2 pb-2">
        <IconButton name="arrow-back" accessibilityLabel="Go back" onPress={() => router.back()} />
        <View className="flex-1">
          <Input
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setQuickError(null);
            }}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            placeholder="Search address, street or area"
            accessibilityLabel="Search for an address"
            containerClassName="w-full"
          />
        </View>
      </View>

      {locatingError ? (
        <Text variant="caption" className="px-5 pb-1 text-warning">
          {locatingError}
        </Text>
      ) : null}
      {quickError ? (
        <Text variant="caption" className="px-5 pb-1 text-danger">
          {quickError}
        </Text>
      ) : null}

      {trimmed.length < 2 ? (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1">
          <View className="px-5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
              disabled={locating}
              onPress={() => void onUseCurrentLocation()}
              className="flex-row items-center py-3 active:opacity-70"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-brand">
                {locating ? (
                  <ActivityIndicator size="small" color={color['brand-contrast']} />
                ) : (
                  <Ionicons name="locate" size={18} color={color['brand-contrast']} />
                )}
              </View>
              <Text variant="bodyStrong" className="ml-3">
                Use my current location
              </Text>
            </Pressable>
          </View>

          <View className="px-5">
            <View className="my-1 h-px bg-border" />
          </View>

          {savedPending ? (
            <View className="px-5 py-6">
              <ActivityIndicator size="small" color={color.brand} />
            </View>
          ) : null}

          {savedItems.length > 0 ? (
            <View className="px-5">
              <Text variant="labelStrong" className="mb-1">
                Saved
              </Text>
              {savedItems.map((item: SavedAddress) => (
                <SavedAddressListItem
                  key={item.id}
                  address={item}
                  onPress={() =>
                    void applyAddress({
                      formattedAddress: item.addressLine1,
                      latitude: item.latitude,
                      longitude: item.longitude,
                      locality: item.locality,
                      city: item.city,
                      state: item.state,
                      postalCode: item.postalCode,
                      placeId: item.placeId,
                    })
                  }
                />
              ))}
              {savedItems.length < (saved?.length ?? 0) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="See all saved addresses"
                  onPress={() => router.push('/saved-addresses')}
                  className="py-2 active:opacity-70"
                >
                  <Text variant="body" className="text-brand">
                    See all {saved?.length} saved addresses
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {recents.length > 0 ? (
            <>
              {savedItems.length > 0 ? (
                <View className="my-1 h-px bg-border" />
              ) : null}
              <View className="px-5">
                <Text variant="labelStrong" className="mb-1 mt-2">
                  Recent
                </Text>
                {recents.map((recent) => (
                  <AddressListItem
                    key={`${recent.latitude.toFixed(5)},${recent.longitude.toFixed(5)}`}
                    icon="pin"
                    title={recent.formattedAddress}
                    subtitle={recentSecondary(recent)}
                    onPress={() => void applyAddress(recent)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {!savedPending && savedItems.length === 0 && recents.length === 0 ? (
            <View className="px-5 py-6">
              <Text variant="body" className="text-text-secondary">
                Search for an area, or use your current location, to set where
                you'd like to book.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={search.data ?? []}
          keyExtractor={(item) => `${item.latitude},${item.longitude},${item.formattedAddress}`}
          ListEmptyComponent={
            search.isPending ? (
              <View className="px-5 py-8">
                <ActivityIndicator size="small" color={color.brand} />
              </View>
            ) : search.isError ? (
              <View className="px-5 py-8">
                <Text variant="body" className="text-text-secondary">
                  Couldn't search — check your connection and try again.
                </Text>
              </View>
            ) : (
              <View className="px-5 py-8">
                <Text variant="body" className="text-text-secondary">
                  No results for “{trimmed}”.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View className="px-5">
              <AddressListItem
                icon="pin"
                title={item.mainLabel || item.formattedAddress}
                subtitle={item.secondary}
                onPress={() => onPickSuggestion(item)}
              />
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );

  function onPickSuggestion(item: AddressSuggestion) {
    openConfirm(suggestionToSelected(item));
  }
}

function recentSecondary(recent: SelectedAddress): string | null {
  const line = [recent.locality, recent.city, recent.state].filter(
    (part): part is string => Boolean(part),
  );
  return line.join(', ') || null;
}
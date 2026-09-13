import { useCallback, useState } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  AddressLabel,
  AddressSuggestion,
  SavedAddress,
} from '@samona/types';

import {
  LocationMapPicker,
  type MapFocusRequest,
  type PickedLocation,
  type ResolveAddressFn,
} from '@/components/location';

import {
  Button,
  Divider,
  IconButton,
  Input,
  Text,
} from '@/components/ui';

import { useUpdateSavedAddress } from '@/hooks';
import { geocodingApi } from '@/services/geocoding';
import { color } from '@/theme';
import {
  fallbackLocationLabel,
  savedAddressToSuggestion,
} from '@/utils/address';

import { SaveAsLabelPicker } from './SaveAsLabelPicker';

interface EditSavedAddressSheetProps {
  address: SavedAddress;
  onClose: () => void;
}

export function EditSavedAddressSheet({
  address,
  onClose,
}: EditSavedAddressSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

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

  const [mapFocus, setMapFocus] = useState<MapFocusRequest | null>(null);

  // ── Keyboard-driven layout ───────────────────────────────────────────────
  //
  // Strategy: instead of transforming the footer (KeyboardStickyView uses
  // translateY which doesn't affect layout and causes content to drift behind
  // the map), we animate two things:
  //
  //   1. animatedMapHeight   — map shrinks when keyboard opens, giving the
  //                            form more visible vertical space.
  //   2. animatedOuterPadding — outer container gains paddingBottom equal to
  //                            the keyboard height, naturally pushing the
  //                            footer above the keyboard without any transform.

  const normalMapHeight = Math.min(screenHeight * 0.4, 340);
  const keyboardMapHeight = Math.min(screenHeight * 0.16, 130);

  const animatedMapHeight = useSharedValue(normalMapHeight);
  const animatedOuterPadding = useSharedValue(0);

  useKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        const duration = event.duration > 0 ? event.duration : 250;
        const isOpening = event.height > 0;

        animatedMapHeight.value = withTiming(
          isOpening ? keyboardMapHeight : normalMapHeight,
          { duration },
        );

        animatedOuterPadding.value = withTiming(
          isOpening ? event.height : 0,
          { duration },
        );
      },

      onEnd: (event) => {
        'worklet';
        // Safety restore in case onStart's closing branch was missed.
        if (event.height === 0) {
          animatedMapHeight.value = withTiming(normalMapHeight, { duration: 250 });
          animatedOuterPadding.value = withTiming(0, { duration: 250 });
        }
      },
    },
    [keyboardMapHeight, normalMapHeight],
  );

  const mapAnimatedStyle = useAnimatedStyle(() => ({
    height: animatedMapHeight.value,
  }));

  const outerAnimatedStyle = useAnimatedStyle(() => ({
    paddingBottom: animatedOuterPadding.value,
  }));

  // ── Handlers ─────────────────────────────────────────────────────────────

  const resolveAddress: ResolveAddressFn = useCallback(
    async (point) => {
      try {
        return await geocodingApi.reverse(point.latitude, point.longitude);
      } catch {
        return null;
      }
    },
    [],
  );

  const handleChange = useCallback((picked: PickedLocation) => {
    setCoords({ latitude: picked.latitude, longitude: picked.longitude });
    setPlace(picked.place ?? null);
  }, []);

  const handleChangePress = useCallback(() => {
    setMapFocus({
      nonce: Date.now(),
      center: [coords.longitude, coords.latitude],
    });
  }, [coords.latitude, coords.longitude]);

  const locality =
    place?.mainLabel ??
    fallbackLocationLabel(coords.latitude, coords.longitude);

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
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/*
       * Outer Animated.View carries the keyboard paddingBottom.
       * When the keyboard opens by K px, paddingBottom = K, so the
       * available height for children shrinks to (screenHeight - K).
       * The footer — a plain View at the bottom of this flex container —
       * naturally sits just above the keyboard with no transform needed.
       */}
      <Animated.View
        style={[
          { flex: 1, backgroundColor: color.surface },
          outerAnimatedStyle,
        ]}
      >

        {/* ============================== */}
        {/* HEADER                        */}
        {/* ============================== */}

        <View
          style={{
            paddingTop: insets.top,
            backgroundColor: color.surface,
            borderBottomWidth: 1,
            borderBottomColor: color.border,
          }}
        >
          <View
            style={{
              height: 52,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
            }}
          >
            <IconButton
              name="close"
              accessibilityLabel="Close"
              variant="plain"
              onPress={onClose}
            />

            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="bodyLg" className="font-semibold">
                Edit Address
              </Text>
            </View>

            {/* Mirror of close button — keeps title visually centred */}
            <View style={{ width: 44 }} />
          </View>
        </View>

        {/* ============================== */}
        {/* MAP                           */}
        {/* ============================== */}

        <Animated.View style={[{ overflow: 'hidden' }, mapAnimatedStyle]}>
          <LocationMapPicker
            value={coords}
            onChange={handleChange}
            resolveAddress={resolveAddress}
            centerPin="marker"
            focus={mapFocus}
            style={{ flex: 1 }}
          />

          {/* Hint pill — just below the centre pin */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '62%',
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: color['surface-inverse'],
                borderRadius: 999,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              <Text variant="caption" style={{ color: color.white }}>
                Place the pin accurately on map
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ============================== */}
        {/* LOCATION ROW                  */}
        {/* ============================== */}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 14,
            backgroundColor: color['surface-muted'],
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              variant="bodyLg"
              numberOfLines={1}
              className="font-semibold"
            >
              {locality}
            </Text>

            <Text
              variant="footnote"
              numberOfLines={2}
              className="mt-0.5 text-text-muted"
            >
              {displayedAddress}
            </Text>
          </View>

          <Button
            variant="outline"
            size="sm"
            fullWidth={false}
            label="Change"
            onPress={handleChangePress}
          />
        </View>

        <Divider />

        {/* ============================== */}
        {/* SCROLLABLE FORM               */}
        {/* ============================== */}

        {/*
         * Plain ScrollView — the keyboard layout is fully handled by the
         * outer container's animated paddingBottom and the map shrink above,
         * so there is no need for KeyboardAwareScrollView here. Mixing it
         * with the outer animation caused content to scroll behind the map.
         */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Input
            label="Name"
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

          <Text variant="label" className="mb-2 mt-6">
            Save as
          </Text>

          <SaveAsLabelPicker value={label} onChange={setLabel} />

          {error ? (
            <Text variant="caption" className="mt-4 text-danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        {/* ============================== */}
        {/* FOOTER — always above keyboard */}
        {/* ============================== */}

        {/*
         * No transform. The animated paddingBottom on the outer container
         * already positions this view just above the keyboard.
         */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: color.border,
            backgroundColor: color.surface,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <Button
            label="Update Address"
            size="lg"
            loading={updateSaved.isPending}
            onPress={() => {
              void handleUpdate();
            }}
          />
        </View>

      </Animated.View>
    </Modal>
  );
}

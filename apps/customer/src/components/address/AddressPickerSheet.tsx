import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SavedAddress } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackgroundProps,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';

import { Button, Text } from '@/components/ui';
import { useSavedAddresses } from '@/hooks';
import { color } from '@/theme';

import { SavedAddressListItem } from './SavedAddressListItem';

interface AddressPickerSheetProps {
  visible: boolean;
  /** The address currently used for the booking, if it is a saved one. */
  selectedId: string | null;
  onClose: () => void;
  onSelect: (address: SavedAddress) => void;
  onAddNew: () => void;
}

/** Top radius of the sheet, matching the rest of the app's surfaces. */
const TOP_RADIUS = 24;
/** Height of the grab handle; the sheet content starts below it. */
const HANDLE_HEIGHT = 20;
/**
 * Fixed resting height: enough for the header, several saved addresses and the
 * add action, while leaving the map visible behind the sheet. Longer lists
 * scroll inside the sheet.
 */
const SNAP_POINTS = ['65%'];

const styles = StyleSheet.create({
  background: {
    backgroundColor: color.surface,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    boxShadow: '0px -16px 24px rgba(15, 23, 42, 0.14)',
  },
});

function SheetBackground({ style }: BottomSheetBackgroundProps) {
  return <View pointerEvents="none" style={[style, styles.background]} />;
}

function SheetHandle() {
  return (
    <View className="items-center justify-center" style={{ height: HANDLE_HEIGHT }}>
      <View className="h-1.5 w-10 rounded-full bg-border-strong" />
    </View>
  );
}

/**
 * Bottom sheet for choosing where the work happens.
 *
 * Lists the customer's saved addresses and keeps an "Add a new address" action
 * so a new place can be created without leaving the booking flow. Selection is
 * reported to the caller; this sheet never changes the profile's active
 * location, because the booking can happen somewhere other than the default.
 *
 * This is a plain `BottomSheet` rather than a `BottomSheetModal`: it is mounted
 * next to the review sheet it belongs to, so it does not depend on a portal
 * host rendering above the current screen.
 *
 * It is driven imperatively after mount. The `index` prop cannot close this
 * sheet on `@gorhom/bottom-sheet@5.2.14`: a snap index of `-1` resolves to
 * `detents[-1]`, which is `undefined`, so the snap method exits without moving
 * the sheet. `close()` uses the closed detent instead, so opening and closing
 * both go through the ref.
 */
export function AddressPickerSheet({
  visible,
  selectedId,
  onClose,
  onSelect,
  onAddNew,
}: AddressPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const { data, isPending, isError, refetch } = useSavedAddresses();

  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  /**
   * Follow the caller's `visible` flag: raise the sheet to its only snap point,
   * or send it back below the screen. `index` stays at `-1` so the sheet starts
   * closed and never opens itself when the screen mounts.
   */
  useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);
      return;
    }

    sheetRef.current?.close();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.4}
      />
    ),
    [],
  );

  const rows = data ?? [];

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enableOverDrag={false}
      enablePanDownToClose
      enableDynamicSizing={false}
      animationConfigs={springConfig}
      backgroundComponent={SheetBackground}
      handleComponent={SheetHandle}
      backdropComponent={renderBackdrop}
      onClose={onClose}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2 px-5 pb-3 pt-1">
          <View className="flex-1">
            <Text variant="title">Service address</Text>
            <Text variant="caption" className="mt-0.5">
              Choose where the work happens
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close address picker"
            onPress={onClose}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
          >
            <Ionicons name="close" size={22} color={color['text-primary']} />
          </Pressable>
        </View>

        <View className="h-px bg-border" />

        {isPending ? (
          <View className="flex-1 items-center justify-center py-10">
            <ActivityIndicator size="small" color={color.brand} />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-5 py-8">
            <Text variant="body" className="text-center text-text-secondary">
              Couldn't load your saved addresses.
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              size="sm"
              className="mt-4"
              onPress={() => void refetch()}
            />
          </View>
        ) : rows.length === 0 ? (
          <View className="flex-1 px-5 py-8">
            <Text variant="body" className="text-text-secondary">
              No saved addresses yet. Add one to use it for this booking.
            </Text>
          </View>
        ) : (
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {rows.map((address, index) => {
              const selected = address.id === selectedId;

              return (
                <View key={address.id}>
                  <View className="px-5">
                    <SavedAddressListItem
                      address={address}
                      onPress={() => onSelect(address)}
                      trailing={
                        <View
                          className={`ml-2 h-6 w-6 items-center justify-center rounded-full ${
                            selected ? 'bg-brand' : 'border border-border'
                          }`}
                        >
                          {selected ? (
                            <Ionicons name="checkmark" size={15} color={color['brand-contrast']} />
                          ) : null}
                        </View>
                      }
                    />
                  </View>
                  {index < rows.length - 1 ? <View className="h-px bg-border" /> : null}
                </View>
              );
            })}
          </BottomSheetScrollView>
        )}

        <View
          className="border-t border-border px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            label="Add a new address"
            variant="secondary"
            leading={<Ionicons name="add" size={20} color={color['text-primary']} />}
            onPress={onAddNew}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

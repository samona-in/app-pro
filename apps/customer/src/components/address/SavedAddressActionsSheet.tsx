import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import type { SavedAddress } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';

interface SavedAddressActionsSheetProps {
  address: SavedAddress;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * The three-dot menu for a saved address: Edit and Delete.
 *
 * Mounted only while a row's menu is openhol, so it animates up on mount and
 * calls `onClose` once the backdrop is pressed or the sheet is panned away.
 */
export function SavedAddressActionsSheet({
  address,
  onEdit,
  onDelete,
  onClose,
}: SavedAddressActionsSheetProps) {
  const snapPoints = useMemo(() => ['30%'], []);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
          pressBehavior="close"
        />
      )}
      onChange={handleChange}
      backgroundStyle={{ backgroundColor: color.surface }}
      handleIndicatorStyle={{ backgroundColor: color['border-strong'] }}
    >
      <BottomSheetView className="px-5 pb-6">
        <Text variant="title" numberOfLines={1}>
          {address.name}
        </Text>
        <Text variant="footnote" numberOfLines={1} className="mt-0.5 text-text-secondary">
          {address.addressLine1}
        </Text>

        <View className="my-2 -mx-5 h-px bg-border" />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit this address"
          onPress={onEdit}
          className="flex-row items-center py-3 active:opacity-70"
        >
          <Ionicons name="create-outline" size={20} color={color['text-primary']} />
          <Text variant="bodyStrong" className="ml-3">
            Edit address
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete this address"
          onPress={onDelete}
          className="flex-row items-center py-3 active:opacity-70"
        >
          <Ionicons name="trash-outline" size={20} color={color.danger} />
          <Text variant="bodyStrong" className="ml-3 text-danger">
            Delete address
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

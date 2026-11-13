import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';

import { ServiceImage } from '@/components/home/ServiceImage';
import { Button, Text } from '@/components/ui';
import { draftTotalPaise, type DraftGroup } from '@/stores/booking';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatRupees } from '@/utils/format';

interface ServiceSelectionSheetProps {
  visible: boolean;
  /** Every service currently in the cart. */
  groups: readonly DraftGroup[];
  onClose: () => void;
  /** The services the customer chose to book now, as slugs. */
  onContinue: (serviceSlugs: string[]) => void;
}

/** Top radius of the sheet, matching the rest of the app's surfaces. */
const TOP_RADIUS = 24;
/** Height of the grab handle; the sheet content starts below it. */
const HANDLE_HEIGHT = 20;
/**
 * Fixed resting height: enough for the header, up to five services (the cart's
 * limit) and the pinned action. Longer lists scroll inside the sheet.
 */
const SNAP_POINTS = ['62%'];

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
 * Asks which services a multi-service cart should book now.
 *
 * One checkout places one request per service, so a cart mixing trades can be
 * split across visits: the customer ticks the services they want today and the
 * rest stay in the cart. Every service starts ticked, so the common case is a
 * single tap on Continue.
 *
 * Mounted next to the cart screen and driven imperatively, like the address
 * picker: the sheet is always in the tree so opening and closing both animate.
 */
export function ServiceSelectionSheet({
  visible,
  groups,
  onClose,
  onContinue,
}: ServiceSelectionSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  useEffect(() => {
    if (visible) {
      // Each opening starts from "everything in the cart is being booked",
      // which is what the cart's Continue already implies.
      setSelectedIds(groupsRef.current.map((group) => group.service.id));
      sheetRef.current?.snapToIndex(0);
      return;
    }

    sheetRef.current?.close();
  }, [visible]);

  const toggleService = useCallback((serviceId: string) => {
    setSelectedIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }, []);

  const allSelected = groups.length > 0 && selectedIds.length === groups.length;
  const selectedGroups = groups.filter((group) => selectedIds.includes(group.service.id));
  const selectedTotal = selectedGroups.reduce(
    (sum, group) => sum + draftTotalPaise(group.items),
    0,
  );

  const toggleAll = useCallback(() => {
    setSelectedIds(
      allSelected ? [] : groupsRef.current.map((group) => group.service.id),
    );
  }, [allSelected]);

  const handleContinue = useCallback(() => {
    if (selectedGroups.length === 0) return;
    onContinue(selectedGroups.map((group) => group.service.slug));
  }, [onContinue, selectedGroups]);

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
            <Text variant="title">Place request for</Text>
            <Text variant="caption" className="mt-0.5">
              Choose the services to book now — the rest stay in your cart
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close service selection"
            onPress={onClose}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
          >
            <Ionicons name="close" size={22} color={color['text-primary']} />
          </Pressable>
        </View>

        <View className="h-px bg-border" />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={allSelected ? 'Clear all services' : 'Select all services'}
          accessibilityState={{ checked: allSelected }}
          onPress={toggleAll}
          className="flex-row items-center gap-3 px-5 py-3 active:bg-surface-muted"
        >
          <SelectionMark selected={allSelected} />
          <Text variant="bodyStrong" className="flex-1">
            All services
          </Text>
          <Text variant="caption">
            {selectedIds.length} of {groups.length} selected
          </Text>
        </Pressable>

        <View className="h-px bg-border" />

        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {groups.map((group, index) => {
            const selected = selectedIds.includes(group.service.id);
            const works = `${group.items.length} ${group.items.length === 1 ? 'work' : 'works'}`;
            const total = formatRupees(draftTotalPaise(group.items));

            return (
              <View key={group.service.id}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${group.service.name}, ${works}, ${total}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleService(group.service.id)}
                  className="flex-row items-center gap-3 px-5 py-3 active:bg-surface-muted"
                >
                  <SelectionMark selected={selected} />
                  <ServiceImage
                    uri={group.service.icon}
                    accessibilityLabel={group.service.name}
                    className="h-9 w-9 rounded-md"
                  />
                  <View className="min-w-0 flex-1">
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {group.service.name}
                    </Text>
                    <Text variant="caption" numberOfLines={1} className="mt-0.5">
                      {works}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" numberOfLines={1} className="shrink-0">
                    {total}
                  </Text>
                </Pressable>
                {index < groups.length - 1 ? <View className="ml-14 h-px bg-border" /> : null}
              </View>
            );
          })}
        </BottomSheetScrollView>

        <View
          className="border-t border-border bg-surface px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="mb-2 flex-row items-center justify-between">
            <Text variant="caption">
              {selectedGroups.length} of {groups.length}{' '}
              {groups.length === 1 ? 'service' : 'services'}
            </Text>
            <Text variant="bodyStrong">{formatRupees(selectedTotal)}</Text>
          </View>
          <Button
            label="Continue"
            size="lg"
            disabled={selectedGroups.length === 0}
            onPress={handleContinue}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

/** The checkbox used by the "all services" row and each service row. */
function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <View
      className={cn(
        'h-6 w-6 items-center justify-center rounded-md',
        selected ? 'bg-brand' : 'border border-border',
      )}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={color['brand-contrast']} /> : null}
    </View>
  );
}

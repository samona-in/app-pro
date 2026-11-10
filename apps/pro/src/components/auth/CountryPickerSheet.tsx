import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import { COUNTRIES, type Country, type CountryIso } from '@/constants/countries';
import { Text } from '@/components/ui';
import { color } from '@/theme';

interface CountryPickerSheetProps {
  visible: boolean;
  /** The calling country currently shown on the phone row. */
  selectedIso: CountryIso;
  onClose: () => void;
  onSelect: (country: Country) => void;
}

/** Top radius of the sheet, matching the rest of the app's surfaces. */
const TOP_RADIUS = 24;
/** Height of the grab handle; the sheet content starts below it. */
const HANDLE_HEIGHT = 20;
/**
 * Fixed resting height: enough for the header and a good stretch of the
 * country list, while the phone form stays visible behind the sheet. The
 * full list scrolls inside.
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

const FLAG_WIDTH = 26;
const FLAG_HEIGHT = 18;
/** Dial codes get a fixed column so the country names align down the list. */
const DIAL_CODE_WIDTH = 48;

/**
 * Bottom sheet for choosing the calling country on the phone login: each row
 * shows the flag, the dial code and the country name. Selection is reported
 * to the caller, which also closes the sheet.
 *
 * This is a plain `BottomSheet` rather than a `BottomSheetModal`: it is
 * mounted next to the phone screen it belongs to, so it does not depend on a
 * portal host rendering above the current screen.
 *
 * It is driven imperatively after mount. The `index` prop cannot close this
 * sheet on `@gorhom/bottom-sheet@5.2.14`: a snap index of `-1` resolves to
 * `detents[-1]`, which is `undefined`, so the snap method exits without
 * moving the sheet. `close()` uses the closed detent instead, so opening and
 * closing both go through the ref.
 */
export function CountryPickerSheet({
  visible,
  selectedIso,
  onClose,
  onSelect,
}: CountryPickerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  /**
   * Follow the caller's `visible` flag: raise the sheet to its only snap
   * point, or send it back below the screen. `index` stays at `-1` so the
   * sheet starts closed and never opens itself when the screen mounts.
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
            <Text variant="title">{t('phone.countryTitle')}</Text>
            <Text variant="caption" className="mt-0.5">
              {t('phone.countrySubtitle')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('phone.closeCountryPicker')}
            onPress={onClose}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
          >
            <Ionicons name="close" size={22} color={color['text-primary']} />
          </Pressable>
        </View>

        <View className="h-px bg-border" />

        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
        >
          {COUNTRIES.map((item, index) => {
            const selected = item.iso === selectedIso;

            return (
              <View key={item.iso}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('phone.countryOption', {
                    country: item.name,
                    dial: item.dial,
                  })}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item)}
                  className="flex-row items-center px-5 py-3 active:opacity-70"
                >
                  <Image
                    source={item.flag}
                    style={{ width: FLAG_WIDTH, height: FLAG_HEIGHT }}
                    contentFit="contain"
                    accessible={false}
                  />
                  <Text
                    variant="bodyLg"
                    className="font-bold text-text-primary"
                    style={{ width: DIAL_CODE_WIDTH }}
                  >
                    +{item.dial}
                  </Text>
                  <View className="mx-3 h-5 w-px bg-border" />
                  <Text variant="body" className="flex-1" numberOfLines={1}>
                    {item.name}
                  </Text>
                </Pressable>
                {index < COUNTRIES.length - 1 ? <View className="h-px bg-border" /> : null}
              </View>
            );
          })}
        </BottomSheetScrollView>
      </View>
    </BottomSheet>
  );
}

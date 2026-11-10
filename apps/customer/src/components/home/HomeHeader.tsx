import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface HomeHeaderProps extends Omit<PressableProps, 'style' | 'children'> {
  /** The customer's location label shown under the caption. */
  locationLabel?: string;
  /**
   * The caption above the location label — "Your location" by default, or the
   * name the customer saved the address under when the active location is one
   * of their saved addresses.
   */
  locationCaption?: string;
  /** Content rendered on the right of the location row (e.g. notifications). */
  trailing?: ReactNode;
  className?: string;
  /**
   * When true the header pads itself for the status bar. Set false when the
   * parent already reserves that inset, as the sticky home layout does.
   */
  safeAreaTop?: boolean;
}

/**
 * Location row for the customer home.
 *
 * A quiet white header in the Zomato mould: a pin-and-caption line above the
 * current location, a chevron that signals the address picker, and the
 * notification bell on the right. The search bar is a separate scroll child so
 * it can pin beneath this row while everything else scrolls away.
 */
export function HomeHeader({
  locationLabel = 'Set your location',
  locationCaption = 'Your location',
  onPress,
  trailing,
  className,
  safeAreaTop = true,
  ...rest
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: safeAreaTop ? insets.top + 8 : 12 }}
      className={cn('bg-surface px-4 pb-1', className)}
    >
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Location: ${locationLabel}`}
          onPress={onPress}
          className="flex-1 flex-row items-center active:opacity-70"
          {...rest}
        >
          <View className="flex-1">
            <View className="flex-row items-center">
              <Ionicons name="location-sharp" size={18} color={color['text-primary']} />
              <Text
                numberOfLines={1}
                variant="bodyLg"
                className="ml-1 shrink font-semibold text-text-primary"
              >
                {locationCaption}
              </Text>
            </View>

            <View className="mt-0.5 flex-row items-center">
              <Text numberOfLines={1} variant="caption" className="mr-1 shrink text-text-muted">
                {locationLabel}
              </Text>
              <Ionicons name="chevron-down" size={16} color={color['text-muted']} />
            </View>
          </View>
        </Pressable>

        {trailing ? <View className="ml-3">{trailing}</View> : null}
      </View>
    </View>
  );
}

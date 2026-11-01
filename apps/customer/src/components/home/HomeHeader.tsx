import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface HomeHeaderProps extends Omit<PressableProps, 'style' | 'children'> {
  /** The customer's location label shown under the pin. */
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
  /** When true, render the header in the brand blue hero style (variant A). */
  variant?: 'light' | 'blue';
  /**
   * When true the header pads itself for the status bar. Set false when the
   * parent already reserves that inset, as the sticky home layout does.
   */
  safeAreaTop?: boolean;
}

/**
 * Location row for the customer home.
 *
 * Only the location row lives here. The search bar and banner are rendered as
 * separate scroll children of the home screen, so the search bar can be pinned
 * with `stickyHeaderIndices` while this header scrolls away.
 */
export function HomeHeader({
  locationLabel = 'Set your location',
  locationCaption = 'Your location',
  onPress,
  trailing,
  className,
  variant = 'light',
  safeAreaTop = true,
  ...rest
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const isBlue = variant === 'blue';

  return (
    <View
      style={{ paddingTop: safeAreaTop ? insets.top + 8 : 8 }}
      className={cn('px-4', isBlue ? 'bg-brand' : 'bg-surface-muted', className)}
    >
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Location: ${locationLabel}`}
          onPress={onPress}
          className="flex-1 flex-row items-center active:opacity-70"
          {...rest}
        >
          <View
            className={cn(
              'h-10 w-10 items-center justify-center rounded-full',
              isBlue ? 'bg-white' : 'bg-brand',
            )}
          >
            <Ionicons
              name="location"
              size={20}
              color={isBlue ? color.brand : color['brand-contrast']}
            />
          </View>
          <View className="ml-3 flex-1">
            <Text variant="caption" className={isBlue ? 'text-white/70' : 'text-brand-muted'}>
              {locationCaption}
            </Text>
            <Text
              numberOfLines={1}
              variant="footnote"
              className={cn('mt-0.5 font-semibold', isBlue ? 'text-white' : 'text-text-primary')}
            >
              {locationLabel}
            </Text>
          </View>
        </Pressable>

        {trailing ? <View className="ml-3">{trailing}</View> : null}
      </View>
    </View>
  );
}

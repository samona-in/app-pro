import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface HomeHeaderProps extends Omit<PressableProps, 'style'> {
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
  /** Extra content rendered below the location row, inside the same band. */
  children?: ReactNode;
  className?: string;
  /** When true, render the header in the brand blue hero style (variant A). */
  variant?: 'light' | 'blue';
  /** Banner carousel to render inside the blue hero band. */
  banner?: ReactNode;
}

/**
 * Full-width header for the customer home.
 *
 * Supports the default soft-grey band and the brand-blue hero (variant A) where
 * the banner carousel lives inside the same band as the location row and search.
 */
export function HomeHeader({
  locationLabel = 'Set your location',
  locationCaption = 'Your location',
  onPress,
  trailing,
  children,
  className,
  variant = 'light',
  banner,
  ...rest
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const isBlue = variant === 'blue';

  return (
    <View
      style={{ paddingTop: insets.top + 8 }}
      className={cn(
        '-mx-2 px-4',
        isBlue ? 'bg-brand' : 'bg-surface-muted',
        banner ? 'pb-3' : 'pb-4',
        className,
      )}
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
            <Text
              variant="caption"
              className={isBlue ? 'text-white/70' : 'text-brand-muted'}
            >
              {locationCaption}
            </Text>
            <Text
              numberOfLines={1}
              variant="footnote"
              className={cn(
                'mt-0.5 font-semibold',
                isBlue ? 'text-white' : 'text-text-primary',
              )}
            >
              {locationLabel}
            </Text>
          </View>
        </Pressable>

        {trailing ? (
          <View className="ml-3">
            {isBlue && trailing
              ? (() => {
                  // Clone trailing to pass white styling context if it's NotificationBell
                  return trailing;
                })()
              : trailing}
          </View>
        ) : null}
      </View>

      {children ? <View className={banner ? 'mt-2' : 'mt-3'}>{children}</View> : null}
      {banner ? <View className="mt-2">{banner}</View> : null}
    </View>
  );
}

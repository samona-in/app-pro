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
}

/**
 * Full-width soft-coloured header for the customer home.
 *
 * The location row is the hero: a pin and the address beneath it, with an
 * optional trailing control (e.g. notifications) on the right. Children (e.g.
 * the search bar) render below it within the same coloured band. The band
 * extends under the status bar — which the screen edges make room for — and
 * clears the inset with its own top padding, so the status bar matches the
 * header background.
 */
export function HomeHeader({
  locationLabel = 'Set your location',
  locationCaption = 'Your location',
  onPress,
  trailing,
  children,
  className,
  ...rest
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: insets.top + 12 }}
      className={cn('-mx-5 bg-surface-muted px-5 pb-6', className)}
    >
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Location: ${locationLabel}`}
          onPress={onPress}
          className="flex-1 flex-row items-center active:opacity-70"
          {...rest}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand">
            <Ionicons name="location" size={20} color={color['brand-contrast']} />
          </View>
          <View className="ml-3 flex-1">
            <Text variant="caption" className="text-brand-muted">
              {locationCaption}
            </Text>
            <Text numberOfLines={1} variant="bodyStrong" className="mt-0.5 text-text-primary">
              {locationLabel}
            </Text>
          </View>
        </Pressable>

        {trailing ? <View className="ml-3">{trailing}</View> : null}
      </View>

      {children ? <View className="mt-5">{children}</View> : null}
    </View>
  );
}

import { Pressable, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface HomeHeaderProps extends Omit<PressableProps, 'style'> {
  /** The customer's location label shown under the pin. */
  locationLabel?: string;
  className?: string;
}

/**
 * Full-width soft-coloured header for the customer home.
 *
 * The location row is the hero: a pin, the address beneath it, and a dropdown
 * affordance on the right to change the saved location. Carries a soft tint so
 * the header reads as a distinct band from the white content below.
 */
export function HomeHeader({
  locationLabel = 'Set your location',
  onPress,
  className,
  ...rest
}: HomeHeaderProps) {
  return (
    <View className={cn('-mx-5 bg-green-50 px-5 pb-6 pt-3', className)}>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Location: ${locationLabel}`}
          onPress={onPress}
          className="flex-1 flex-row items-center active:opacity-70"
          {...rest}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <Ionicons name="location" size={20} color={color.success} />
          </View>
          <View className="ml-3 flex-1">
            <Text variant="caption" className="text-green-700">
              Your location
            </Text>
            <Text
              numberOfLines={1}
              variant="bodyStrong"
              className="mt-0.5 text-text-primary"
            >
              {locationLabel}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={color['text-secondary']} />
        </Pressable>
      </View>
    </View>
  );
}

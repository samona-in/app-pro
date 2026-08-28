import { Pressable, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface PromoBannerProps extends Omit<PressableProps, 'style'> {
  className?: string;
}

/**
 * Full-width promotional banner on the customer home.
 *
 * Left side carries the offer copy and a "Book now" call to action; the right
 * side shows a decorated illustrative badge (the electrician trade) with a
 * subtle floral/dot pattern behind it. The pattern and illustration are built
 * from vector icons, so no external image asset is required.
 */
export function PromoBanner({ onPress, className, ...rest }: PromoBannerProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Book now — Up to 60% off on your first service"
      onPress={onPress}
      className={cn(
        'relative flex-row items-center overflow-hidden rounded-xl bg-green-100 px-5 py-4 active:opacity-90',
        className,
      )}
      {...rest}
    >
      {/* Subtle floral / decorative pattern */}
      <View pointerEvents="none" className="absolute right-4 top-2 opacity-60">
        <Ionicons name="leaf-outline" size={26} color={color.success} />
      </View>
      <View pointerEvents="none" className="absolute -bottom-3 -right-1">
        <Ionicons name="ellipse" size={60} color={color['success-surface']} />
      </View>

      <View className="flex-1 pr-3">
        <Text variant="display" className="text-green-700">
          Up to 60% off
        </Text>
        <Text variant="body" className="mt-1 text-green-700">
          On your first service
        </Text>
        <View className="mt-3 flex-row items-center">
          <Text variant="bodyStrong" className="text-green-700">
            Book now
          </Text>
          <Ionicons name="arrow-forward" size={16} color={color.success} />
        </View>
      </View>

      <View className="h-20 w-20 items-center justify-center rounded-full bg-green-50">
        <Ionicons name="construct-outline" size={36} color={color.success} />
      </View>
    </Pressable>
  );
}

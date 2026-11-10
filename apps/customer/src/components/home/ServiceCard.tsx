import { Pressable, View, type PressableProps } from 'react-native';
import type { ServiceOption } from '@samona/types';
import { ServiceImage } from './ServiceImage';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface ServiceCardProps extends Omit<PressableProps, 'style'> {
  service: ServiceOption;
  /** When true, the label is emphasised. */
  active?: boolean;
  /** Extra classes for the artwork, e.g. a corner radius a screen prefers. */
  imageClassName?: string;
  className?: string;
}

/**
 * One category tile in the home services grid (3-up).
 *
 * A square catalogue image with the category name beneath it. The fixed
 * two-line label box keeps every tile in a row the same height, so the grid
 * reads as clean columns even when names wrap.
 */
export function ServiceCard({
  service,
  active = false,
  imageClassName,
  onPress,
  className,
  ...rest
}: ServiceCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={service.name}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn('items-center', className)}
      {...rest}
    >
      <View className="border-2 border-transparent p-0.5">
        <ServiceImage
          uri={service.icon}
          accessibilityLabel={service.name}
          className={cn('h-16 w-16', imageClassName)}
        />
      </View>

      <Text
        numberOfLines={2}
        variant="caption"
        className={cn('mt-1.5 h-8 text-center text-text-primary', active && 'font-semibold')}
      >
        {service.name}
      </Text>
    </Pressable>
  );
}

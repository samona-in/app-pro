import { Pressable, View, type PressableProps } from 'react-native';
import type { ServiceOption } from '@samona/types';
import { ServiceImage } from './ServiceImage';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface ServiceCardProps extends Omit<PressableProps, 'style'> {
  service: ServiceOption;
  /** When true, the tile wears a dark ring and a bold label. */
  active?: boolean;
  className?: string;
}

/**
 * One category tile in the home services grid (4-up).
 *
 * A circular catalogue image with the category name beneath it. The fixed
 * two-line label box keeps every tile in a row the same height, so the grid
 * reads as clean columns even when names wrap.
 */
export function ServiceCard({
  service,
  active = false,
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
      <View
        className={cn(
          'rounded-full border-2 p-0.5',
          active ? 'border-text-primary' : 'border-transparent',
        )}
      >
        <ServiceImage
          uri={service.icon}
          accessibilityLabel={service.name}
          className="h-16 w-16 rounded-full"
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

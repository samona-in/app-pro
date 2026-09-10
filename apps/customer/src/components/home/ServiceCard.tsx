import { Pressable, type PressableProps } from 'react-native';
import type { ServiceOption } from '@samona/types';
import { ServiceImage } from './ServiceImage';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface ServiceCardProps extends Omit<PressableProps, 'style'> {
  service: ServiceOption;
  /** When true, the label renders emphasized in the primary color. */
  active?: boolean;
  className?: string;
}

/**
 * One category tile in the home services grid (3-up).
 *
 * A light, rounded image tile with the category name beneath, drawn from the
 * backend catalogue's image URL when one is present.
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
      <ServiceImage
        uri={service.icon}
        accessibilityLabel={service.name}
        className="h-16 w-16 rounded-lg"
      />
      <Text
        variant="caption"
        className={cn(
          'mt-2 text-center',
          active ? 'font-semibold text-text-primary' : 'text-text-secondary',
        )}
      >
        {service.name}
      </Text>
    </Pressable>
  );
}

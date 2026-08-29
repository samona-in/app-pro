import { Pressable, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceOption } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface ServiceCardProps extends Omit<PressableProps, 'style'> {
  service: ServiceOption;
  /** When true, the icon tile renders with a dark filled background. */
  active?: boolean;
  className?: string;
}

/**
 * One category tile in the home services grid (3-up).
 *
 * A light, rounded icon tile with the category name beneath, drawn from the
 * backend catalogue's Ionicons name when one is present.
 */
export function ServiceCard({ service, active = false, onPress, className, ...rest }: ServiceCardProps) {
  const iconName = (service.icon ?? 'grid-outline') as React.ComponentProps<
    typeof Ionicons
  >['name'];

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
          'h-16 w-16 items-center justify-center rounded-lg',
          active ? 'bg-brand' : 'bg-surface-muted',
        )}
      >
        <Ionicons
          name={iconName}
          size={28}
          color={active ? color['brand-contrast'] : color['text-secondary']}
        />
      </View>
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

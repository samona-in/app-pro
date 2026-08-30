import { View, type ViewProps } from 'react-native';
import type { ServiceOption } from '@samona/types';
import { ServiceCard } from './ServiceCard';
import { cn } from '@/utils/cn';

export interface ServiceGridProps extends ViewProps {
  services: ServiceOption[];
  /** Slug of the currently selected category. */
  activeSlug?: string;
  onSelect?: (service: ServiceOption) => void;
  className?: string;
}

/**
 * 3-column grid of service categories.
 *
 * Renders a same-width tile per row with generous vertical spacing between
 * rows, wrapping the last row naturally.
 */
export function ServiceGrid({
  services,
  activeSlug,
  onSelect,
  className,
  ...rest
}: ServiceGridProps) {
  return (
    <View className={cn('flex-row flex-wrap', className)} {...rest}>
      {services.map((service) => (
        <View key={service.id} className="mb-7 w-1/3">
          <ServiceCard
            service={service}
            active={service.slug === activeSlug}
            onPress={() => onSelect?.(service)}
          />
        </View>
      ))}
    </View>
  );
}

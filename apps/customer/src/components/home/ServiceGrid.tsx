import { View, type ViewProps } from 'react-native';
import type { ServiceOption } from '@samona/types';
import { ServiceCard } from './ServiceCard';
import { cn } from '@/utils/cn';

export interface ServiceGridProps extends ViewProps {
  services: ServiceOption[];
  /** Slug of the currently selected category. */
  activeSlug?: string;
  /** Extra classes for every tile's artwork. */
  imageClassName?: string;
  onSelect?: (service: ServiceOption) => void;
  className?: string;
}

/**
 * 3-column grid of service categories.
 *
 * Each column takes exactly a third of the content width, so the centres —
 * and the gutters between them — stay even on every screen size. Only vertical
 * spacing is added inside the grid: the page owns the outer gutter.
 */
export function ServiceGrid({
  services,
  activeSlug,
  imageClassName,
  onSelect,
  className,
  ...rest
}: ServiceGridProps) {
  return (
    <View className={cn('flex-row flex-wrap gap-y-5', className)} {...rest}>
      {services.map((service) => (
        <View key={service.id} className="w-1/3">
          <ServiceCard
            service={service}
            active={service.slug === activeSlug}
            imageClassName={imageClassName}
            onPress={() => onSelect?.(service)}
          />
        </View>
      ))}
    </View>
  );
}

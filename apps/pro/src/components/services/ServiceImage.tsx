import { Image, View } from 'react-native';
import { cn } from '@/utils/cn';

/** True when a stored `services.icon` value is an image URL, not a legacy name. */
function isImageUrl(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('/')
  );
}

export interface ServiceImageProps {
  /** The stored `services.icon` value (an image URL). */
  uri?: string | null;
  className?: string;
  accessibilityLabel?: string;
}

/**
 * Renders a service's image into a rounded muted tile.
 *
 * The catalogue's `icon` column now holds image URLs. When the stored value is
 * null or a leftover legacy Ionicons name the tile stays empty, so nothing ever
 * flashes a broken image.
 */
export function ServiceImage({ uri, className, accessibilityLabel }: ServiceImageProps) {
  const hasImage = uri != null && isImageUrl(uri);

  return (
    <View className={cn('overflow-hidden bg-surface-muted', className)}>
      {hasImage ? (
        <Image
          source={{ uri }}
          accessibilityLabel={accessibilityLabel}
          resizeMode="cover"
          className="h-full w-full"
        />
      ) : null}
    </View>
  );
}

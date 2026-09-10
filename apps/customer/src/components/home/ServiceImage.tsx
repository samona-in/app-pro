import { View } from 'react-native';
import { Image } from 'expo-image';
import { cn } from '@/utils/cn';

/** True when a stored `services.icon` value is an image URL, not a legacy name. */
export function isImageUrl(value: string | null): boolean {
  return (
    value != null &&
    (value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:') ||
      value.startsWith('/'))
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
 * The catalogue's `icon` column now holds image URLs. `expo-image` keeps
 * fetched images in memory and on disk, so a tile still renders instantly when
 * the customer returns to the screen, and shows a muted tile while loading.
 * There is deliberately no fade transition: its Android cross-fade can leave a
 * small tile blank when the screen is detached and re-attached behind the
 * booking flow, which is exactly the "image missing after picking a service"
 * symptom. When the stored value is null or a leftover legacy Ionicons name
 * the tile stays empty, so nothing ever flashes a broken image.
 */
export function ServiceImage({ uri, className, accessibilityLabel }: ServiceImageProps) {
  const hasImage = uri != null && isImageUrl(uri);

  return (
    <View className={cn('overflow-hidden bg-surface-muted', className)}>
      {hasImage ? (
        <Image
          source={uri}
          style={{ width: '100%', height: '100%' }}
          accessibilityLabel={accessibilityLabel}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={(event) => console.warn('[ServiceImage] failed to load:', uri, event.error)}
        />
      ) : null}
    </View>
  );
}

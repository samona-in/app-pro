import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ServiceWorkGroupWithWorks } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { isImageUrl } from '@/components/home/ServiceImage';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const IMAGE_KEY_ICONS: Record<string, IoniconName> = {
  fan: 'sync-outline',
  light: 'bulb-outline',
  switch: 'toggle-outline',
  wiring: 'construct-outline',
  panel: 'power-outline',
  'ev-charger': 'car-sport-outline',
  security: 'videocam-outline',
  toolbox: 'build-outline',
  tap: 'water-outline',
  pipes: 'git-network-outline',
  toilet: 'home-outline',
  drain: 'funnel-outline',
  shower: 'water-outline',
  'water-heater': 'thermometer-outline',
  'gas-line': 'flame-outline',
  furniture: 'bed-outline',
  door: 'grid-outline',
  modular: 'grid-outline',
  'air-conditioner': 'snow-outline',
  appliances: 'settings-outline',
  cleaning: 'sparkles-outline',
  carpet: 'grid-outline',
  pest: 'bug-outline',
  'car-wash': 'car-outline',
  battery: 'battery-charging-outline',
  laptop: 'laptop-outline',
  'data-recovery': 'server-outline',
  painting: 'color-palette-outline',
  waterproofing: 'water-outline',
  moving: 'cube-outline',
  boxes: 'cube-outline',
};

function WorkGroupArtwork({
  name,
  imageUrl,
  failedImageUrls,
  onImageError,
}: {
  name: string;
  imageUrl: string | null;
  failedImageUrls: ReadonlySet<string>;
  onImageError: () => void;
}) {
  const imageKey = imageUrl?.startsWith('asset://') ? imageUrl.split('/').at(-1) : null;
  const remoteImage = imageUrl !== null && isImageUrl(imageUrl) && !failedImageUrls.has(imageUrl);
  const icon = IMAGE_KEY_ICONS[imageKey ?? ''] ?? 'build-outline';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} illustration`}
      className="aspect-square w-full items-center justify-center overflow-hidden bg-surface"
    >
      {remoteImage ? (
        <Image
          source={{ uri: imageUrl! }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={`${name} illustration`}
          onError={onImageError}
        />
      ) : (
        <Ionicons name={icon} size={28} color={color['text-secondary']} />
      )}
    </View>
  );
}

export interface WorkGroupNavigationProps {
  groups: readonly ServiceWorkGroupWithWorks[];
  activeGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** Work categories displayed in a 4-column grid. */
export function WorkGroupNavigation({
  groups,
  activeGroupId,
  onSelectGroup,
  onLayout,
}: WorkGroupNavigationProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());

  return (
    <View onLayout={onLayout} className="bg-surface">
      <View className="-mx-1 flex-row flex-wrap">
        {groups.map((group) => {
          const selected = group.id === activeGroupId;

          return (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              accessibilityLabel={group.name}
              onPress={() => onSelectGroup(group.id)}
              className={cn('w-1/4 px-1 pb-4 active:opacity-70')}
            >
              <View className="aspect-square w-full overflow-hidden rounded-md border border-border">
                <WorkGroupArtwork
                  name={group.name}
                  imageUrl={group.imageUrl}
                  failedImageUrls={failedImageUrls}
                  onImageError={() => {
                    const imageUrl = group.imageUrl;
                    if (!imageUrl) return;
                    setFailedImageUrls((current) => new Set(current).add(imageUrl));
                  }}
                />
              </View>
              <Text variant="footnote" numberOfLines={2} className="mt-2 text-center">
                {group.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

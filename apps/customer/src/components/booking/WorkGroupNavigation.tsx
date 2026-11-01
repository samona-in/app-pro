import { useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
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
      className="h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-2xl bg-brand-soft"
    >
      <View className="absolute -right-3 -top-3 h-10 w-10 rounded-full bg-white/75" />
      <View className="absolute -bottom-3 -left-2 h-9 w-9 rounded-full bg-[#DDEAF7]" />
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
        <>
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/80">
            <Ionicons name={icon} size={28} color={color.brand} />
          </View>
          <View className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-[#E5A36E]" />
        </>
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

/** Horizontally scrollable, sticky group bar for the customer work catalogue. */
export function WorkGroupNavigation({
  groups,
  activeGroupId,
  onSelectGroup,
  onLayout,
}: WorkGroupNavigationProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());

  return (
    <View onLayout={onLayout} className="border-b border-border bg-surface py-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pr-5"
        accessibilityLabel="Work categories"
      >
        {groups.map((group) => {
          const selected = group.id === activeGroupId;
          const workLabel = `${group.works.length} ${group.works.length === 1 ? 'work' : 'works'}`;

          return (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              accessibilityLabel={`${group.name}, ${workLabel}`}
              accessibilityHint="Scroll to this work category"
              accessibilityState={{ selected }}
              onPress={() => onSelectGroup(group.id)}
              className={cn(
                'w-[88px] items-center rounded-2xl border px-2 py-2 active:opacity-70',
                selected ? 'border-brand bg-brand-soft' : 'border-border bg-surface',
              )}
            >
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
              <Text
                variant="footnote"
                numberOfLines={2}
                className={cn('mt-1 min-h-9 text-center', selected && 'font-semibold text-brand')}
              >
                {group.name}
              </Text>
              <Text variant="caption" className="text-center">
                {workLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

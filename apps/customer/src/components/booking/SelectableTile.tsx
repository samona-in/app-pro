import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceImage, isImageUrl } from '@/components/home/ServiceImage';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface SelectableTileProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Catalogue image thumbnail, rendered instead of `icon` when set. */
  imageUri?: string | null;
}

/**
 * A compact single-choice tile for the skill grid.
 *
 * The artwork does the scanning work, so the tile is square and the label sits
 * under it in two lines. Selected state is a brand border plus a check badge,
 * which stays legible against photos of any colour.
 */
export function SelectableTile({
  label,
  selected,
  onToggle,
  icon,
  imageUri,
}: SelectableTileProps) {
  const hasImage = isImageUrl(imageUri ?? null);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="items-center active:opacity-70"
    >
      <View
        className={cn(
          'aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 bg-surface',
          selected ? 'border-brand' : 'border-border',
        )}
      >
        {hasImage ? (
          <ServiceImage uri={imageUri} accessibilityLabel={label} className="h-full w-full" />
        ) : (
          <Ionicons
            name={icon ?? 'pricetag-outline'}
            size={28}
            color={selected ? color.brand : color['text-secondary']}
          />
        )}

        {selected ? (
          <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-brand">
            <Ionicons name="checkmark" size={13} color={color['brand-contrast']} />
          </View>
        ) : null}
      </View>

      <Text
        variant="footnote"
        numberOfLines={2}
        className={cn(
          'mt-2 text-center',
          selected ? 'font-semibold text-brand' : 'text-text-primary',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceImage, isImageUrl } from '@/components/services/ServiceImage';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface SelectableServiceTileProps {
  label: string;
  /** The stored `services.icon`: an image URL, or a legacy Ionicons name. */
  icon: string | null;
  selected: boolean;
  onToggle: () => void;
}

/**
 * One service in a four-across grid of choices.
 *
 * The service's thumbnail fills the top of the tile and the name wraps beneath
 * it. The tile itself is transparent so the grid stays light; selecting adds
 * the brand border, a check badge and a brand-coloured name, while the
 * thumbnail is left untouched so the catalogue image still reads clearly.
 * Legacy rows whose icon is an Ionicons name render the glyph instead of an
 * image, so no tile is ever blank.
 */
export function SelectableServiceTile({
  label,
  icon,
  selected,
  onToggle,
}: SelectableServiceTileProps) {
  const hasImage = icon != null && isImageUrl(icon);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onToggle}
      className={cn(
        'w-[22%] overflow-hidden rounded-lg border active:opacity-70',
        selected ? 'border-brand' : 'border-border',
      )}
    >
      <View className="aspect-square w-full">
        {hasImage ? (
          <ServiceImage
            uri={icon}
            accessibilityLabel={label}
            transparent
            className="h-full w-full"
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Ionicons
              name={(icon ?? 'grid-outline') as IoniconName}
              size={24}
              color={selected ? color.brand : color['text-secondary']}
            />
          </View>
        )}
        {selected ? (
          <View className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-brand">
            <Ionicons name="checkmark" size={13} color={color['brand-contrast']} />
          </View>
        ) : null}
      </View>

      <Text
        variant="footnote"
        numberOfLines={2}
        className={cn('px-1 py-2 text-center', selected && 'font-semibold text-brand')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceImage, isImageUrl } from '@/components/services/ServiceImage';
import { Text } from '@/components/ui/Text';
import { color, elevation } from '@/theme';
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
 * One service in a three-across grid of choices.
 *
 * Each tile is a square raised card: a bordered surface with a soft shadow,
 * so the options read as separate tappable items rather than loose thumbnails.
 * The thumbnail fills the card above the name, which sits at the bottom edge.
 * Selecting thickens the border to the brand colour and adds a check badge,
 * while the thumbnail is left untouched so the catalogue image still reads
 * clearly. Legacy rows whose icon is an Ionicons name render the glyph instead
 * of an image, so no tile is ever blank.
 */
export function SelectableServiceTile({
  label,
  icon,
  selected,
  onToggle,
}: SelectableServiceTileProps) {
  const hasImage = icon != null && isImageUrl(icon);

  return (
    /* The shadow lives on this outer wrapper: `overflow-hidden` on the pressable
       (needed to clip the thumbnail to the card's rounded corners) would clip
       the shadow too. */
    <View
      style={elevation.sm}
      className={cn(
        'aspect-square w-[30%] rounded-xl border bg-surface',
        selected ? 'border-brand' : 'border-border',
      )}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        onPress={onToggle}
        className="flex-1 overflow-hidden rounded-xl active:opacity-70"
      >
        <View className="flex-1">
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
          className={cn('px-1 py-1 text-center text-text-primary', selected && 'font-semibold')}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

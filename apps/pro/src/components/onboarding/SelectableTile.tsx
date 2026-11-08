import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { Text } from '@/components/ui/Text';
import { cn } from '@/utils/cn';

export interface SelectableTileProps {
  label: string;
  /** Bundled illustration shown above the label. */
  image: ImageSourcePropType;
  selected: boolean;
  onToggle: () => void;
}

/**
 * One option in a compact grid of choices, drawn as a small portrait card.
 *
 * The artwork sits on a tinted plate that bleeds to the tile's top and side
 * edges. The illustrations are cut-outs with a transparent background, so
 * without the plate the tile's white shows through above the figure; the plate
 * gives the portrait a soft surface instead. Selecting the option tints the
 * plate brand-soft, turns the border brand blue and highlights the label;
 * accessibility still announces it as a checked radio.
 */
export function SelectableTile({ label, image, selected, onToggle }: SelectableTileProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onToggle}
      className={cn(
        'flex-1 overflow-hidden rounded-lg border active:opacity-70',
        selected ? 'border-brand bg-brand-soft' : 'border-border bg-surface',
      )}
    >
      <View
        className={cn(
          'h-20 w-full items-center justify-center',
          selected ? 'bg-brand-soft' : 'bg-surface-muted',
        )}
      >
        <Image
          source={image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          className="h-full w-full"
        />
      </View>
      <Text
        variant="footnote"
        className={cn('py-2 text-center', selected && 'font-semibold text-brand')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

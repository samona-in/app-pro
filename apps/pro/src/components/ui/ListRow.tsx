import { Pressable, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface ListRowProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Glyph shown on a small surface-muted tile at the leading edge. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** Secondary line under the label. */
  caption?: string;
  /** Rendered before the chevron on the trailing edge (e.g. a Badge). */
  trailing?: React.ReactNode;
  /** Adds danger colouring to the icon and label for destructive rows. */
  destructive?: boolean;
  /** Whether to draw the hairline rule below the row. Omit for the last row. */
  showDivider?: boolean;
  className?: string;
}

/**
 * Full-width settings/action row, bleed-to-edge in a padded screen with the
 * hairline separated by `-mx-5` so each section reads as a clean list rather
 * than a boxed card.
 */
export function ListRow({
  icon,
  label,
  caption,
  trailing,
  destructive = false,
  showDivider = true,
  onPress,
  disabled,
  accessibilityLabel,
  className,
  ...rest
}: ListRowProps) {
  const tint = destructive ? color.danger : color['text-secondary'];
  const hasAction = Boolean(onPress) && disabled !== true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !hasAction }}
      disabled={!hasAction}
      onPress={onPress}
      className={cn('py-1.5 active:opacity-70', className)}
      {...rest}
    >
      <View className="flex-row items-center">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-muted">
          <Ionicons name={icon} size={18} color={tint} />
        </View>

        <View className="ml-3 flex-1">
          <Text variant="body" className={destructive ? 'text-danger' : ''}>
            {label}
          </Text>
          {caption ? (
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              {caption}
            </Text>
          ) : null}
        </View>

        {trailing ? <View className="ml-3">{trailing}</View> : null}
        <Ionicons
          name="chevron-forward"
          size={18}
          color={hasAction ? color['text-muted'] : 'transparent'}
          style={{ marginLeft: 12 }}
        />
      </View>

      {showDivider ? <View className="my-1.5 -mx-5 h-px bg-border" /> : null}
    </Pressable>
  );
}

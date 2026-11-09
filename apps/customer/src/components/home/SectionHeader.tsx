import { Pressable, Text as RNText, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Inline action rendered on the right, e.g. "See all". */
  actionLabel?: string;
  /** Accessibility label for the action; defaults to `${actionLabel} ${title}`. */
  actionAccessibilityLabel?: string;
  onPressAction?: () => void;
  className?: string;
}

/**
 * The home page's section heading.
 *
 * One consistent row for every section: a strong left-aligned title (with an
 * optional supporting line) and a quiet inline action on the right. Sections
 * supply their own horizontal gutter so every heading lines up with the cards
 * beneath it.
 */
export function SectionHeader({
  title,
  subtitle,
  actionLabel = 'See all',
  actionAccessibilityLabel,
  onPressAction,
  className,
}: SectionHeaderProps) {
  return (
    <View className={cn('flex-row items-center justify-between', className)}>
      <View className="flex-1 pr-3">
        <Text variant="title" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" numberOfLines={1} className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {onPressAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? `${actionLabel} ${title}`}
          onPress={onPressAction}
          hitSlop={8}
          className="flex-row items-center active:opacity-60"
        >
          {/* Raw text, not the `Text` variant: the action is the one black
              piece in the row, and a variant's own colour would compete. */}
          <RNText className="text-footnote font-semibold text-text-primary">{actionLabel}</RNText>
          <Ionicons name="chevron-forward" size={14} color={color['text-primary']} />
        </Pressable>
      ) : null}
    </View>
  );
}

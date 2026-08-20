import { View } from 'react-native';
import { Text } from './Text';
import { cn } from '@/utils/cn';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneStyles: Record<BadgeTone, { container: string; label: string }> = {
  neutral: { container: 'bg-surface-muted', label: 'text-text-secondary' },
  success: { container: 'bg-success-surface', label: 'text-success' },
  warning: { container: 'bg-warning-surface', label: 'text-warning' },
  danger: { container: 'bg-danger-surface', label: 'text-danger' },
  info: { container: 'bg-info-surface', label: 'text-info' },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Shows a small leading dot — useful for live/availability states. */
  withDot?: boolean;
  className?: string;
}

export function Badge({ label, tone = 'neutral', withDot = false, className }: BadgeProps) {
  const styles = toneStyles[tone];
  return (
    <View
      className={cn(
        'flex-row items-center self-start rounded-full px-3 py-1',
        styles.container,
        className,
      )}
    >
      {withDot ? (
        <View className={cn('mr-1.5 h-2 w-2 rounded-full', styles.label.replace('text-', 'bg-'))} />
      ) : null}
      <Text variant="caption" className={cn('font-semibold', styles.label)}>
        {label}
      </Text>
    </View>
  );
}

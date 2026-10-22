import { Text as RNText, View } from 'react-native';
import { cn } from '@/utils/cn';

export type BadgeTone = 'neutral' | 'success' | 'success-solid' | 'warning' | 'danger' | 'info';

const toneStyles: Record<BadgeTone, { container: string; label: string }> = {
  neutral: { container: 'bg-surface-muted', label: 'text-text-secondary' },
  success: { container: 'bg-success-surface', label: 'text-success' },
  // The filled variant: the badge carries the colour, the label sits on it.
  'success-solid': { container: 'bg-success', label: 'text-text-inverse' },
  warning: { container: 'bg-warning-surface', label: 'text-warning' },
  danger: { container: 'bg-danger-surface', label: 'text-danger' },
  info: { container: 'bg-info-surface', label: 'text-info' },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
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
      {/*
        The label sets its own colour instead of wearing a text variant: a
        variant carries its own colour, and the two utilities would compete.
        Keeping the tone's colour as the only colour on the label means the
        filled badge always shows its label in white.
      */}
      <RNText className={cn('text-caption font-semibold', styles.label)}>{label}</RNText>
    </View>
  );
}

import { View, type ViewProps } from 'react-native';
import { elevation } from '@/theme';
import { cn } from '@/utils/cn';

export interface CardProps extends ViewProps {
  className?: string;
  /** `flat` suits dense lists; `raised` lifts a single focal card. */
  variant?: 'flat' | 'raised';
  padded?: boolean;
}

export function Card({ className, variant = 'flat', padded = true, style, ...rest }: CardProps) {
  return (
    <View
      style={[variant === 'raised' ? elevation.md : elevation.none, style]}
      className={cn(
        'rounded-xl bg-surface',
        variant === 'flat' && 'border border-border',
        padded && 'p-4',
        className,
      )}
      {...rest}
    />
  );
}

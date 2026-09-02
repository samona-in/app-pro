import { View, type ViewProps } from 'react-native';
import { elevation } from '@/theme';
import { cn } from '@/utils/cn';

export interface CardProps extends ViewProps {
  className?: string;
  /** `flat` suits dense lists; `raised` lifts a single focal card. */
  variant?: 'flat' | 'raised';
  /** Dark variant for the onboarding surface. */
  dark?: boolean;
  padded?: boolean;
}

export function Card({ className, variant = 'flat', dark = false, padded = true, style, ...rest }: CardProps) {
  return (
    <View
      style={[variant === 'raised' ? elevation.md : elevation.none, style]}
      className={cn(
        'rounded-xl',
        dark ? 'border border-onboarding-border bg-onboarding-surface' : 'bg-surface',
        variant === 'flat' && !dark && 'border border-border',
        padded && 'p-4',
        className,
      )}
      {...rest}
    />
  );
}

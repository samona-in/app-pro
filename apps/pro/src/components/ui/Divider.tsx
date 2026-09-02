import { View } from 'react-native';
import { cn } from '@/utils/cn';

export interface DividerProps {
  className?: string;
  /** Adds vertical breathing room around the rule. */
  spaced?: boolean;
  /** Dark variant for the onboarding surface. */
  dark?: boolean;
}

export function Divider({ className, spaced = false, dark = false }: DividerProps) {
  return (
    <View
      accessibilityRole="none"
      className={cn('h-px w-full', dark ? 'bg-onboarding-border' : 'bg-border', spaced && 'my-4', className)}
    />
  );
}

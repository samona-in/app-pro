import { View } from 'react-native';
import { cn } from '@/utils/cn';

export interface DividerProps {
  className?: string;
  spaced?: boolean;
}

export function Divider({ className, spaced = false }: DividerProps) {
  return (
    <View
      accessibilityRole="none"
      className={cn('h-px w-full bg-border', spaced && 'my-4', className)}
    />
  );
}

import { View } from 'react-native';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  inverse?: boolean;
  className?: string;
}

/**
 * Customer-side brand treatment.
 * Shows "SAMONA" with a "CUSTOMER" lockup using type alone.
 */
export function Wordmark({ size = 'md', inverse = false, className }: WordmarkProps) {
  const wordSize = size === 'lg' ? 'display' : size === 'md' ? 'titleLg' : 'title';

  return (
    <View
      accessibilityRole="header"
      accessibilityLabel="SAMONA Customer"
      className={cn('flex-row items-center', className)}
    >
      <Text
        variant={wordSize}
        className={cn('tracking-tight', inverse ? 'text-text-inverse' : 'text-text-primary')}
      >
        SAMONA
      </Text>
      <View className={cn('ml-2 rounded-md px-2 py-0.5', inverse ? 'bg-text-inverse' : 'bg-brand')}>
        <Text
          variant="caption"
          className={cn(
            'font-bold tracking-widest',
            inverse ? 'text-brand' : 'text-brand-contrast',
          )}
        >
          CUSTOMER
        </Text>
      </View>
    </View>
  );
}

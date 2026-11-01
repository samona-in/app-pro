import { View } from 'react-native';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  inverse?: boolean;
  className?: string;
}

/**
 * Customer-side brand treatment.
 * Shows "SAMONA" with a "CUSTOMER" lockup using type alone.
 *
 * Colours are set with inline styles on purpose: every text variant already
 * carries its own colour class, and `cn` only joins class names, so a second
 * colour class would be resolved by stylesheet order rather than by intent.
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
        className="tracking-tight"
        style={{ color: inverse ? color['text-inverse'] : color['text-primary'] }}
      >
        SAMONA
      </Text>
      <View
        className="ml-2 rounded-md px-2 py-0.5"
        style={{ backgroundColor: inverse ? color['text-inverse'] : color.brand }}
      >
        <Text
          variant="caption"
          className="font-bold tracking-widest"
          style={{ color: inverse ? color.brand : color['brand-contrast'] }}
        >
          CUSTOMER
        </Text>
      </View>
    </View>
  );
}

import { View } from 'react-native';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  /** Use on dark surfaces. */
  inverse?: boolean;
  /**
   * Tighter lockup for crowded headers (wordmark + availability toggle + bell
   * on a narrow Android screen): keeps the full "SAMONA PRO" name and the brand
   * badge, only with tighter spacing around it.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Temporary text-only brand treatment.
 *
 * SAMONA branding is not finalised, so this deliberately avoids inventing a
 * logo: it sets "SAMONA" against a "PRO" lockup using type alone. Replace this
 * one component when the real identity lands.
 */
export function Wordmark({
  size = 'md',
  inverse = false,
  compact = false,
  className,
}: WordmarkProps) {
  if (compact) {
    return (
      <View
        accessibilityRole="header"
        accessibilityLabel="SAMONA Pro"
        className={cn('flex-row items-center', className)}
      >
        <Text
          variant="bodyStrong"
          className={cn('tracking-tight', inverse ? 'text-text-inverse' : 'text-text-primary')}
        >
          SAMONA
        </Text>
        <View
          className={cn('ml-1 rounded-md px-1.5 py-0.5', inverse ? 'bg-text-inverse' : 'bg-brand')}
        >
          <Text
            variant="caption"
            className={cn(
              'text-[10px] font-bold leading-4 tracking-wide',
              inverse ? 'text-brand' : 'text-brand-contrast',
            )}
          >
            PRO
          </Text>
        </View>
      </View>
    );
  }

  const wordSize = size === 'lg' ? 'display' : size === 'md' ? 'titleLg' : 'title';

  return (
    <View
      accessibilityRole="header"
      accessibilityLabel="SAMONA Pro"
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
          PRO
        </Text>
      </View>
    </View>
  );
}

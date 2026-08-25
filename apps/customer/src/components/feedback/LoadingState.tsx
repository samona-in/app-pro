import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface LoadingStateProps {
  message?: string;
  size?: 'inline' | 'full';
  className?: string;
}

export function LoadingState({ message, size = 'full', className }: LoadingStateProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading'}
      className={cn(
        'items-center justify-center',
        size === 'full' ? 'flex-1 py-12' : 'py-6',
        className,
      )}
    >
      <ActivityIndicator size={size === 'full' ? 'large' : 'small'} color={color.brand} />
      {message ? (
        <Text variant="footnote" className="mt-3">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

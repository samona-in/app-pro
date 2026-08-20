import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface ErrorStateProps {
  title?: string;
  /**
   * A message the user can act on. Never pass a raw exception here — the API
   * returns human-readable messages for exactly this slot.
   */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this right now. Please try again.',
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center px-6 py-12', className)}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-danger-surface">
        <Ionicons name="alert-circle-outline" size={28} color={color.danger} />
      </View>

      <Text variant="title" className="text-center">
        {title}
      </Text>
      <Text variant="body" className="mt-2 text-center text-text-secondary">
        {message}
      </Text>

      {onRetry ? (
        <Button
          label={retryLabel}
          variant="secondary"
          onPress={onRetry}
          fullWidth={false}
          className="mt-6"
        />
      ) : null}
    </View>
  );
}

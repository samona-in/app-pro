import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center px-6 py-12', className)}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Ionicons name={icon} size={28} color={color['text-muted']} />
      </View>

      <Text variant="title" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" className="mt-2 text-center text-text-secondary">
          {message}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="secondary"
          onPress={onAction}
          fullWidth={false}
          className="mt-6"
        />
      ) : null}
    </View>
  );
}

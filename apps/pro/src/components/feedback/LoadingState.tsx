import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface LoadingStateProps {
  message?: string;
  /** `inline` sits inside a section; `full` centres in the remaining space. */
  size?: 'inline' | 'full';
  className?: string;
}

export function LoadingState({ message, size = 'full', className }: LoadingStateProps) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? t('common.loading')}
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

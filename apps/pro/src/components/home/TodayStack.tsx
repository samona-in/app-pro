import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@/components/ui';
import { color } from '@/theme';

/**
 * Two headline numbers for the day: how much the pro has earned today and how
 * many jobs they have completed.
 *
 * Static placeholders until the earnings API is connected.
 */
export function TodayStack() {
  const { t } = useTranslation();
  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between">
        <Text variant="title">{t('today.title')}</Text>
      </View>
      <View className="mt-3 flex-row gap-3">
        <Card className="flex-1 bg-surface-muted">
          <Ionicons name="cash-outline" size={18} color={color['text-secondary']} />
          <Text variant="label" className="mt-1 text-text-muted">
            {t('today.earnings')}
          </Text>
          <Text variant="title" className="mt-1">
            ₹0
          </Text>
        </Card>
        <Card className="flex-1 bg-surface-muted">
          <Ionicons name="checkmark-done-outline" size={18} color={color['text-secondary']} />
          <Text variant="label" className="mt-1 text-text-muted">
            {t('today.jobsCompleted')}
          </Text>
          <Text variant="title" className="mt-1">
            0
          </Text>
        </Card>
      </View>
    </View>
  );
}

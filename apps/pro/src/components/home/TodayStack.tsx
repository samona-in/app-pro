import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';

/**
 * Two headline numbers for the day: how much the pro has earned today and how
 * many jobs they have completed.
 *
 * Static placeholders until the earnings API is connected. Rendered as a plain
 * unboxed figure row — numerals and captions with a single hairline between —
 * so the dashboard reads as a list of sections rather than a stack of cards.
 */
export function TodayStack() {
  const { t } = useTranslation();
  return (
    <View className="mt-7">
      <View className="flex-row items-center justify-between">
        <Text variant="title">{t('today.title')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.viewEarningsA11y')}
          onPress={() => undefined}
          className="flex-row items-center"
        >
          <Text variant="caption" className="text-brand">
            {t('today.viewDetails')}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={color.brand} />
        </Pressable>
      </View>
      <View className="mt-4 flex-row">
        <View className="flex-1 pr-4">
          <View className="flex-row items-center">
            <Ionicons name="cash-outline" size={16} color={color['text-muted']} />
            <Text variant="label" className="ml-1.5 text-text-muted">
              {t('today.earnings')}
            </Text>
          </View>
          <Text variant="title" className="mt-1">
            ₹0
          </Text>
        </View>
        <View className="w-px self-stretch bg-border" />
        <View className="flex-1 pl-4">
          <View className="flex-row items-center">
            <Ionicons name="checkmark-done-outline" size={16} color={color['text-muted']} />
            <Text variant="label" className="ml-1.5 text-text-muted">
              {t('today.jobsCompleted')}
            </Text>
          </View>
          <Text variant="title" className="mt-1">
            0
          </Text>
        </View>
      </View>
    </View>
  );
}

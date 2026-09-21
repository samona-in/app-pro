import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Divider, Screen, Text } from '@/components/ui';
import type { TranslationKey } from '@/i18n';

const BREAKDOWN: { labelKey: TranslationKey; value: string }[] = [
  { labelKey: 'earnings.breakdownRows.completedJobs', value: '0' },
  { labelKey: 'earnings.breakdownRows.jobEarnings', value: '₹0' },
  { labelKey: 'earnings.breakdownRows.tips', value: '₹0' },
  { labelKey: 'earnings.breakdownRows.samonaFee', value: '₹0' },
];

export default function Earnings() {
  const { t } = useTranslation();
  return (
    <Screen scrollable>
      <View className="pt-2">
        <Text variant="titleLg">{t('tabs.earnings')}</Text>
      </View>

      <Card variant="raised" className="mt-4 bg-surface-inverse">
        <Text variant="label" className="text-text-muted">
          {t('earnings.thisWeek')}
        </Text>
        <Text variant="metric" className="mt-1 text-text-inverse">
          ₹0
        </Text>
        <Text variant="footnote" className="mt-1">
          {t('earnings.payoutNote')}
        </Text>
      </Card>

      <Text variant="title" className="mt-8">
        {t('earnings.breakdown')}
      </Text>

      <Card className="mt-3" padded={false}>
        {BREAKDOWN.map((row, index) => (
          <View key={row.labelKey}>
            {index > 0 ? <Divider /> : null}
            <View className="flex-row items-center justify-between px-4 py-4">
              <Text variant="body" className="text-text-secondary">
                {t(row.labelKey)}
              </Text>
              <Text variant="bodyStrong">{row.value}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Text variant="caption" className="mt-4">
        {t('earnings.devCaveat')}
      </Text>
    </Screen>
  );
}
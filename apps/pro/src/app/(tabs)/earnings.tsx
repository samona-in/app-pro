import { View } from 'react-native';
import { Card, Divider, Screen, Text } from '@/components/ui';

const BREAKDOWN = [
  { label: 'Completed jobs', value: '0' },
  { label: 'Job earnings', value: '₹0' },
  { label: 'Tips', value: '₹0' },
  { label: 'SAMONA fee', value: '₹0' },
] as const;

export default function Earnings() {
  return (
    <Screen scrollable>
      <View className="pt-2">
        <Text variant="titleLg">Earnings</Text>
      </View>

      <Card variant="raised" className="mt-4 bg-surface-inverse">
        <Text variant="label" className="text-text-muted">
          This week
        </Text>
        <Text variant="metric" className="mt-1 text-text-inverse">
          ₹0
        </Text>
        <Text variant="footnote" className="mt-1">
          Payouts land in your account every Monday.
        </Text>
      </Card>

      <Text variant="title" className="mt-8">
        Breakdown
      </Text>

      <Card className="mt-3" padded={false}>
        {BREAKDOWN.map((row, index) => (
          <View key={row.label}>
            {index > 0 ? <Divider /> : null}
            <View className="flex-row items-center justify-between px-4 py-4">
              <Text variant="body" className="text-text-secondary">
                {row.label}
              </Text>
              <Text variant="bodyStrong">{row.value}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Text variant="caption" className="mt-4">
        Figures are placeholders until the earnings API is connected.
      </Text>
    </Screen>
  );
}

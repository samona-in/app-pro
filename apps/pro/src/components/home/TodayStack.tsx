import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@/components/ui';
import { color } from '@/theme';

const METRICS = [
  {
    icon: 'cash-outline',
    label: 'Earnings',
    value: '₹0',
  },
  {
    icon: 'checkmark-done-outline',
    label: 'Jobs completed',
    value: '0',
  },
] as const;

/**
 * Two headline numbers for the day: how much the pro has earned today and how
 * many jobs they have completed.
 *
 * Static placeholders until the earnings API is connected.
 */
export function TodayStack() {
  return (
    <View className="mt-6">
      <Text variant="title">Today</Text>
      <View className="mt-3 flex-row gap-3">
        {METRICS.map((metric) => (
          <Card key={metric.label} className="flex-1">
            <View className="items-center">
              <Ionicons name={metric.icon} size={20} color={color.brand} />
              <Text variant="caption" className="mt-2 text-text-muted">
                {metric.label}
              </Text>
              <Text variant="title" className="mt-3 font-semibold">
                {metric.value}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}

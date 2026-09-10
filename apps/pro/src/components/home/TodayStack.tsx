import { View } from 'react-native';
import { Card, Text } from '@/components/ui';

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
        <Card className="flex-1">
          <Text variant="label" className="text-text-muted">
            Earnings
          </Text>
          <Text variant="metric" className="mt-1">
            ₹0
          </Text>
        </Card>
        <Card className="flex-1">
          <Text variant="label" className="text-text-muted">
            Jobs completed
          </Text>
          <Text variant="metric" className="mt-1">
            0
          </Text>
        </Card>
      </View>
    </View>
  );
}

import { Pressable, View } from 'react-native';
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
  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between">
        <Text variant="title">Today</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View earnings details"
          onPress={() => undefined}
          className="flex-row items-center"
        >
          <Text variant="caption" className="text-brand">
            View details
          </Text>
          <Ionicons name="chevron-forward" size={14} color={color.brand} />
        </Pressable>
      </View>
      <View className="mt-3 flex-row gap-3">
        <Card className="flex-1">
          <Ionicons name="cash-outline" size={18} color={color['text-secondary']} />
          <Text variant="label" className="mt-1 text-text-muted">
            Earnings
          </Text>
          <Text variant="title" className="mt-1">
            ₹0
          </Text>
        </Card>
        <Card className="flex-1">
          <Ionicons name="checkmark-done-outline" size={18} color={color['text-secondary']} />
          <Text variant="label" className="mt-1 text-text-muted">
            Jobs completed
          </Text>
          <Text variant="title" className="mt-1">
            0
          </Text>
        </Card>
      </View>
    </View>
  );
}

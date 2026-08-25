import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { EmptyState } from '@/components/feedback';
import { Screen, Text } from '@/components/ui';
import { cn } from '@/utils/cn';

const FILTERS = ['Active', 'Upcoming', 'Completed'] as const;
type Filter = (typeof FILTERS)[number];

export default function Bookings() {
  const [filter, setFilter] = useState<Filter>('Active');

  return (
    <Screen>
      <View className="pt-2">
        <Text variant="titleLg">Bookings</Text>
      </View>

      <View className="mt-4 flex-row rounded-lg bg-surface-muted p-1">
        {FILTERS.map((item) => {
          const isSelected = item === filter;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setFilter(item)}
              className={cn(
                'min-h-[40px] flex-1 items-center justify-center rounded-md',
                isSelected && 'bg-surface',
              )}
            >
              <Text
                variant="footnote"
                className={cn('font-semibold', isSelected && 'text-text-primary')}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <EmptyState
        icon="calendar-outline"
        title={`No ${filter.toLowerCase()} bookings`}
        message="Bookings you make will show up here, with everything you need to track your service."
      />
    </Screen>
  );
}

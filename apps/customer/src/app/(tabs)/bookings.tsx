import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceRequestStatus } from '@samona/types';
import { EmptyState } from '@/components/feedback';
import { Card, Divider, Screen, Text } from '@/components/ui';
import { RequestStatusBadge } from '@/components/requests';
import { useRequests } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatInr, formatRelativeTime } from '@/utils/format';

const FILTERS = ['Active', 'Completed', 'All'] as const;
type Filter = (typeof FILTERS)[number];

function isTerminal(status: ServiceRequestStatus): boolean {
  return (
    status === 'COMPLETED' || status === 'PAID' || status === 'CANCELLED' || status === 'EXPIRED'
  );
}

export default function Bookings() {
  const [filter, setFilter] = useState<Filter>('Active');
  const { data: requests, isPending } = useRequests();

  const visible = useMemo(() => {
    const all = requests ?? [];
    if (filter === 'Active') return all.filter((request) => !isTerminal(request.status));
    if (filter === 'Completed')
      return all.filter((request) => request.status === 'COMPLETED' || request.status === 'PAID');
    return all;
  }, [filter, requests]);

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

      {visible.length > 0 ? (
        <Card padded={false} className="mt-4 overflow-hidden">
          {visible.map((request, index) => (
            <View key={request.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/booking/${request.id}`)}
                className="active:bg-surface-muted"
              >
                <View className="flex-row items-center gap-3 px-4 py-4">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text variant="bodyStrong" className="flex-shrink">
                        {request.service.name}
                      </Text>
                      <RequestStatusBadge status={request.status} />
                    </View>
                    <View className="mt-1 flex-row items-center gap-2">
                      <Text variant="footnote" className="text-text-secondary" numberOfLines={1}>
                        {request.address ?? request.description ?? 'Service request'}
                      </Text>
                      <Text variant="caption" className="text-text-muted">
                        {formatRelativeTime(request.updatedAt)}
                      </Text>
                    </View>
                  </View>
                  <View className="items-end gap-1">
                    <Text variant="bodyStrong">
                      {formatInr(request.finalPrice ?? request.estimatedPrice)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
                  </View>
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <View className="mt-2 flex-1">
          <EmptyState
            icon="calendar-outline"
            title={isPending ? 'Loading your bookings' : `No ${filter.toLowerCase()} bookings`}
            message={
              filter === 'Active'
                ? 'Start a new request and your active bookings will appear here, ready to track.'
                : 'Bookings you complete will show up here.'
            }
          />
        </View>
      )}
    </Screen>
  );
}
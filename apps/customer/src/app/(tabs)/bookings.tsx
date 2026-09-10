import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { JobStatus, type Job } from '@samona/types';
import { BookingCard } from '@/components/booking';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Screen, Text } from '@/components/ui';
import { useBookings } from '@/hooks';
import { cn } from '@/utils/cn';

const FILTERS = ['Active', 'Upcoming', 'Completed'] as const;
type Filter = (typeof FILTERS)[number];

const ACTIVE: readonly JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.OFFERED,
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
  JobStatus.PAYMENT_PENDING,
];

const UPCOMING: readonly JobStatus[] = [JobStatus.REQUESTED, JobStatus.OFFERED, JobStatus.ACCEPTED];

const COMPLETED: readonly JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.PAID,
  JobStatus.CANCELLED,
  JobStatus.EXPIRED,
];

const FILTER_STATUSES: Record<Filter, readonly JobStatus[]> = {
  Active: ACTIVE,
  Upcoming: UPCOMING,
  Completed: COMPLETED,
};

function matchesFilter(job: Job, filter: Filter): boolean {
  return FILTER_STATUSES[filter].includes(job.status);
}

export default function Bookings() {
  const [filter, setFilter] = useState<Filter>('Active');
  const bookings = useBookings();

  const visible = useMemo(
    () => (bookings.data ?? []).filter((job) => matchesFilter(job, filter)),
    [bookings.data, filter],
  );

  return (
    <Screen>
      <View className="pt-2">
        <Text variant="titleLg">Bookings</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
        <View className="flex-row gap-2">
          {FILTERS.map((item) => {
            const isSelected = item === filter;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setFilter(item)}
                className={cn(
                  'min-h-[40px] items-center justify-center rounded-full border px-4 py-2',
                  isSelected ? 'border-primary bg-primary' : 'border-border bg-surface-muted',
                )}
              >
                <Text
                  variant="footnote"
                  className={cn(
                    'font-semibold',
                    isSelected ? 'text-primary-foreground' : 'text-text-secondary',
                  )}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="mt-5 flex-1">
        {bookings.isPending ? (
          <View className="flex-1 justify-center">
            <LoadingState message="Loading bookings" size="inline" />
          </View>
        ) : bookings.isError ? (
          <View className="flex-1 justify-center">
            <ErrorState
              title="Couldn't load bookings"
              message="Check your connection and try again."
              onRetry={() => void bookings.refetch()}
            />
          </View>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={`No ${filter.toLowerCase()} bookings`}
            message="Bookings you make will show up here, with everything you need to track your service."
          />
        ) : (
          <View className="gap-3">
            {visible.map((job) => (
              <BookingCard key={job.id} job={job} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

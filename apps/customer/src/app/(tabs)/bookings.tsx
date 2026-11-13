import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JobStatus, type Job } from '@samona/types';
import { BookingRow } from '@/components/booking';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Screen, SegmentedControl, Text } from '@/components/ui';
import { useBookings } from '@/hooks';
import { FLOATING_TAB_BAR_CLEARANCE } from '@/constants';
import { color } from '@/theme';

const FILTERS = ['All', 'Active', 'Upcoming', 'Past'] as const;
type Filter = (typeof FILTERS)[number];

const ACTIVE: readonly JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.OFFERED,
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
];

const UPCOMING: readonly JobStatus[] = [JobStatus.REQUESTED, JobStatus.OFFERED, JobStatus.ACCEPTED];

const PAST: readonly JobStatus[] = [JobStatus.PAID, JobStatus.CANCELLED, JobStatus.EXPIRED];

const FILTER_STATUSES: Record<Exclude<Filter, 'All'>, readonly JobStatus[]> = {
  Active: ACTIVE,
  Upcoming: UPCOMING,
  Past: PAST,
};

/** What an empty segment says, so it never promises bookings it cannot show. */
const EMPTY_COPY: Record<Filter, { title: string; message: string }> = {
  All: {
    title: 'No bookings',
    message: 'Bookings you make will show up here, with everything you need to track your service.',
  },
  Active: {
    title: 'No active bookings',
    message: 'Jobs that are on the way, being worked on, or waiting on you will show up here.',
  },
  Upcoming: {
    title: 'No upcoming bookings',
    message: 'Jobs that are finding a professional will show up here.',
  },
  Past: {
    title: 'No past bookings',
    message: 'Completed and cancelled bookings will show up here.',
  },
};

function matchesFilter(job: Job, filter: Filter): boolean {
  if (filter === 'All') return true;
  return FILTER_STATUSES[filter].includes(job.status);
}

export default function Bookings() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('All');
  const bookings = useBookings();
  const [refreshing, setRefreshing] = useState(false);

  const jobs = useMemo(() => bookings.data ?? [], [bookings.data]);
  const visible = useMemo(() => jobs.filter((job) => matchesFilter(job, filter)), [jobs, filter]);
  const activeCount = useMemo(
    () => jobs.filter((job) => ACTIVE.includes(job.status)).length,
    [jobs],
  );
  /**
   * How many bookings each multi-service checkout produced. A group only
   * counts bookings still visible in this list, which is the same set the
   * customer is looking at.
   */
  const groupSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const job of jobs) {
      if (!job.orderGroupId) continue;
      sizes.set(job.orderGroupId, (sizes.get(job.orderGroupId) ?? 0) + 1);
    }
    return sizes;
  }, [jobs]);

  const summary =
    jobs.length === 0
      ? 'No bookings yet'
      : activeCount > 0
        ? `${jobs.length} booking${jobs.length === 1 ? '' : 's'} · ${activeCount} active`
        : `${jobs.length} booking${jobs.length === 1 ? '' : 's'}`;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await bookings.refetch();
    } catch (error) {
      console.warn('[bookings] pull-to-refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen padded={false}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View className="px-4 pt-4">
        <Text variant="titleLg">Bookings</Text>
        <Text variant="footnote" className="mt-1">
          {summary}
        </Text>
      </View>

      {/* ── Segment filter ──────────────────────────────────────────────── */}
      <View className="px-4 pt-4">
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {/* ── Scrollable booking list ─────────────────────────────────────── */}
      <ScrollView
        className="mt-3 flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + FLOATING_TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
            progressBackgroundColor={color.surface}
          />
        }
      >
        {bookings.isPending ? (
          <View className="items-center py-10">
            <LoadingState message="Loading bookings" size="inline" />
          </View>
        ) : bookings.isError ? (
          <View className="items-center py-10">
            <ErrorState
              title="Couldn't load bookings"
              message="Check your connection and try again."
              onRetry={() => void bookings.refetch()}
            />
          </View>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={EMPTY_COPY[filter].title}
            message={EMPTY_COPY[filter].message}
          />
        ) : (
          visible.map((job, index) => (
            <View key={job.id}>
              {/* Hairline separator, the full width of the screen. */}
              {index > 0 ? <View className="h-px bg-border" /> : null}
              <BookingRow
                job={job}
                groupServiceCount={job.orderGroupId ? groupSizes.get(job.orderGroupId) : undefined}
              />
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

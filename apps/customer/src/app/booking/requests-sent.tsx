import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { workSummaryLabel } from '@samona/types';
import { ServiceImage } from '@/components/home/ServiceImage';
import { EmptyState } from '@/components/feedback';
import { Button, Screen, Text } from '@/components/ui';
import { useBookings } from '@/hooks';
import { bookingStatusLabel } from '@/components/booking/BookingRow';
import { color } from '@/theme';
import { formatRupees } from '@/utils/format';
import { describeJobWorks, jobItemName } from '@/utils/pricing';

/**
 * The post-checkout summary.
 *
 * One checkout may have created several independent bookings, one per service.
 * This screen lists every booking that was just placed, with its service, works
 * and estimate, and links straight into each one. The jobs are read from the
 * bookings cache the checkout seeded, so the summary renders immediately; the
 * shared `orderGroupId` keeps the group identifiable if the list is refetched.
 */
export default function RequestsSent() {
  const { orderGroupId } = useLocalSearchParams<{ orderGroupId?: string }>();
  const bookings = useBookings();

  const jobs = useMemo(() => {
    const all = bookings.data ?? [];
    if (!orderGroupId) return [];
    return all.filter((job) => job.orderGroupId === orderGroupId);
  }, [bookings.data, orderGroupId]);

  const count = jobs.length;

  if (count === 0) {
    return (
      <Screen edges={['top', 'bottom']} className="bg-surface">
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon="checkmark-circle-outline"
            title="Requests sent"
            message="Your bookings are on their way. You'll find them in your bookings list."
            actionLabel="View all bookings"
            onAction={() => router.replace('/(tabs)/bookings')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top', 'bottom']}
      scrollable
      padded={false}
      className="bg-surface"
      contentClassName="px-5 pb-6"
      footer={
        <View className="border-t border-border bg-surface px-5 pt-3">
          <Button
            label="View all bookings"
            size="lg"
            onPress={() => router.replace('/(tabs)/bookings')}
          />
        </View>
      }
    >
      <View className="items-center pt-8">
        {/* The animated badge carries the "Requests sent" confirmation itself,
            so the header is just the artwork and the supporting copy. */}
        <View className="pb-2 pt-6">
          <Image
            source={require('@/assets/images/animations/samona_requests_sent.gif')}
            style={{ width: 290, height: 97 }}
            contentFit="contain"
            accessibilityLabel="Requests sent"
          />
        </View>
        <Text variant="body" className="mt-2 text-center text-text-secondary">
          {count === 1
            ? "We've sent your request to professionals nearby. You'll be notified when someone accepts."
            : `We've sent ${count} bookings to professionals nearby — one per service. You'll be notified as each one is accepted.`}
        </Text>
      </View>

      {count > 1 ? (
        <View className="mt-6 flex-row items-center justify-center gap-1.5">
          <Ionicons name="layers-outline" size={14} color={color.brand} />
          <Text variant="caption" className="font-semibold text-brand">
            {count} bookings placed together
          </Text>
        </View>
      ) : null}

      <View className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
        {jobs.map((job, index) => {
          const title =
            job.items.length > 1
              ? workSummaryLabel(job.items.map(jobItemName))
              : jobItemName(job.items[0] ?? { skill: job.skill, customSkill: job.customSkill });
          const works = describeJobWorks(job);
          const artwork = job.skill.icon ?? job.service.icon;

          return (
            <View key={job.id}>
              {index > 0 ? <View className="h-px bg-border" /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${job.service.name} booking`}
                onPress={() => router.push(`/booking/${job.id}`)}
                className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
              >
                <ServiceImage
                  uri={artwork}
                  accessibilityLabel={job.service.name}
                  className="h-12 w-12 rounded-lg"
                />
                <View className="min-w-0 flex-1">
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {job.service.name}
                  </Text>
                  <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-secondary">
                    {title}
                    {works ? ` · ${works}` : ''}
                  </Text>
                  <Text variant="caption" numberOfLines={1} className="mt-0.5 text-brand">
                    {formatRupees(job.basePayPaise)} · {bookingStatusLabel(job.status)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
              </Pressable>
            </View>
          );
        })}
      </View>

      <View className="mt-4 flex-row items-center justify-center gap-1.5">
        <Ionicons name="shield-checkmark" size={14} color={color.success} />
        <Text variant="caption">Pay each professional in cash after the work is done</Text>
      </View>
    </Screen>
  );
}
